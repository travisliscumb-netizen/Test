import { linear, rgba, seededRandom } from "../paint";
import { glow, ridge, wrap } from "./shapes";
import type { Backdrop } from "./types";

/** Crystal cavern: glowing crystal clusters, rock columns, hanging stalactites and drifting motes. */
export function cavernBackdrop(): Backdrop {
  return {
    sky: [
      [0, "#04050c"],
      [0.6, "#0e1328"],
      [1, "#1a2242"],
    ],
    ambient: { count: 40, color: "#7af0e0", size: 1.3, vx: 0.05, vy: -0.18, glow: true },
    layers: [
      {
        width: 1800,
        height: 420,
        y: 60,
        factor: 0.1,
        paint: (ctx) => {
          const rnd = seededRandom(61);
          for (let i = 0; i < 7; i++) {
            const x = (i / 7) * 1800 + rnd() * 100;
            const base = 300 + rnd() * 80;
            const hue = rnd() < 0.5 ? "#5af0d8" : "#9a7cff";
            wrap(1800, (o) => {
              glow(ctx, x + o, base - 60, 140, [
                [0, rgba(hue, 0.35)],
                [1, rgba(hue, 0)],
              ]);
              for (let k = 0; k < 5; k++) {
                const cx = x + o + (k - 2) * 14 + (rnd() - 0.5) * 8;
                const h = 50 + rnd() * 90;
                const w = 9 + rnd() * 8;
                const tilt = (k - 2) * 0.12;
                ctx.beginPath();
                ctx.moveTo(cx - w, base);
                ctx.lineTo(cx - w * 0.6 + tilt * h, base - h * 0.85);
                ctx.lineTo(cx + tilt * h, base - h);
                ctx.lineTo(cx + w * 0.6 + tilt * h, base - h * 0.85);
                ctx.lineTo(cx + w, base);
                ctx.closePath();
                ctx.fillStyle = linear(ctx, cx - w, 0, cx + w, 0, [
                  [0, rgba(hue, 0.5)],
                  [0.45, rgba("#ffffff", 0.75)],
                  [1, rgba(hue, 0.35)],
                ]);
                ctx.fill();
              }
            });
          }
        },
      },
      {
        width: 1500,
        height: 480,
        y: 0,
        factor: 0.28,
        paint: (ctx) => {
          const rnd = seededRandom(71);
          for (let i = 0; i < 8; i++) {
            const x = (i / 8) * 1500 + rnd() * 60;
            const w = 34 + rnd() * 40;
            wrap(1500, (o) => {
              ctx.fillStyle = linear(ctx, x + o, 0, x + o + w, 0, [
                [0, "#1c2440"],
                [0.3, "#2c3a62"],
                [1, "#121830"],
              ]);
              ctx.fillRect(x + o, 0, w, 480);
              ctx.fillStyle = rgba("#7af0e0", 0.12);
              ctx.fillRect(x + o + 3, 0, 2, 480);
            });
          }
          ctx.fillStyle = linear(ctx, 0, 300, 0, 480, [
            [0, "rgba(40, 90, 120, 0)"],
            [1, "rgba(40, 90, 120, 0.35)"],
          ]);
          ctx.fillRect(0, 300, 1500, 180);
        },
      },
      {
        width: 1300,
        height: 480,
        y: 0,
        factor: 0.5,
        paint: (ctx) => {
          // Stalactites from the roof.
          const rnd = seededRandom(81);
          ctx.fillStyle = "#0a0e1e";
          ctx.fillRect(0, 0, 1300, 26);
          for (let i = 0; i < 46; i++) {
            const x = rnd() * 1300;
            const len = 30 + rnd() * 130;
            const w = 10 + rnd() * 22;
            wrap(1300, (o) => {
              ctx.beginPath();
              ctx.moveTo(x + o - w / 2, 0);
              ctx.quadraticCurveTo(x + o - w * 0.2, len * 0.6, x + o, len);
              ctx.quadraticCurveTo(x + o + w * 0.2, len * 0.6, x + o + w / 2, 0);
              ctx.closePath();
              ctx.fillStyle = linear(ctx, x + o - w / 2, 0, x + o + w / 2, 0, [
                [0, "#0c1022"],
                [0.7, "#1e2848"],
                [1, "#3a5a7a"],
              ]);
              ctx.fill();
            });
          }
          // Rocky floor reaching the bottom of the view.
          ridge(ctx, 1300, 480, 400, 91, [[5, 18], [11, 7]], linear(ctx, 0, 380, 0, 480, [
            [0, "#1a2238"],
            [1, "#06080f"],
          ]));
        },
      },
    ],
  };
}
