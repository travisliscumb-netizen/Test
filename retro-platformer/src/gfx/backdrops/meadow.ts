import { linear, seededRandom, shade } from "../paint";
import { cloud, glow, ridge, wrap } from "./shapes";
import type { Backdrop } from "./types";

/** Sunny meadow: a bright sky, misty blue mountains, drifting clouds and rolling wooded hills. */
export function meadowBackdrop(): Backdrop {
  return {
    sky: [
      [0, "#3a86e0"],
      [0.45, "#7cc0f6"],
      [0.75, "#c4e8ff"],
      [1, "#eaf8ff"],
    ],
    ambient: { count: 26, color: "#fffbe0", size: 1.4, vx: 0.25, vy: 0.05, glow: true },
    layers: [
      {
        width: 1600,
        height: 260,
        y: 0,
        factor: 0.02,
        paint: (ctx) => {
          glow(ctx, 1100, 90, 220, [
            [0, "rgba(255, 252, 220, 0.95)"],
            [0.12, "rgba(255, 245, 200, 0.75)"],
            [0.4, "rgba(255, 240, 200, 0.18)"],
            [1, "rgba(255, 240, 200, 0)"],
          ]);
          ctx.beginPath();
          ctx.arc(1100, 90, 26, 0, Math.PI * 2);
          ctx.fillStyle = "#fffdf0";
          ctx.fill();
        },
      },
      {
        width: 1600,
        height: 300,
        y: 120,
        factor: 0.08,
        paint: (ctx) => {
          const far = ridge(ctx, 1600, 300, 120, 3, [[2, 60], [5, 26], [13, 8]], linear(ctx, 0, 40, 0, 300, [
            [0, "#9cb8dc"],
            [1, "#d8ecfa"],
          ]));
          // Snow caps that fade down the high peaks.
          for (let x = 0; x <= 1600; x += 1) {
            const t = far(x);
            if (t >= 96) continue;
            const depth = 6 + (96 - t) * 0.6;
            ctx.fillStyle = linear(ctx, 0, t, 0, t + depth, [
              [0, "rgba(255, 255, 255, 0.95)"],
              [1, "rgba(255, 255, 255, 0)"],
            ]);
            ctx.fillRect(x, t, 1.2, depth);
          }
          ridge(ctx, 1600, 300, 170, 9, [[3, 40], [7, 14], [17, 5]], linear(ctx, 0, 110, 0, 300, [
            [0, "#7f9ec8"],
            [1, "#c8e0f4"],
          ]));
        },
      },
      {
        width: 2000,
        height: 220,
        y: 10,
        factor: 0.18,
        drift: 0.12,
        paint: (ctx) => {
          const rnd = seededRandom(31);
          for (let i = 0; i < 7; i++) {
            const x = (i / 7) * 2000 + rnd() * 160;
            const y = 40 + rnd() * 90;
            const w = 80 + rnd() * 110;
            wrap(2000, (o) => cloud(ctx, x + o, y, w, "#ffffff", "#c6dcf2", 100 + i));
          }
        },
      },
      {
        width: 1600,
        height: 300,
        y: 200,
        factor: 0.32,
        paint: (ctx) => {
          const top = ridge(ctx, 1600, 300, 90, 17, [[3, 34], [7, 12]], linear(ctx, 0, 40, 0, 300, [
            [0, "#6cbf5a"],
            [0.5, "#3f9a48"],
            [1, "#2c7a3c"],
          ]));
          // Tree clusters along the crest.
          const rnd = seededRandom(41);
          for (let i = 0; i < 40; i++) {
            const x = rnd() * 1600;
            const y = top(x) + 6;
            const r = 9 + rnd() * 12;
            wrap(1600, (o) => {
              ctx.fillStyle = "#3a6a2c";
              ctx.fillRect(x + o - 1.5, y, 3, r * 0.9);
              ctx.beginPath();
              ctx.arc(x + o, y, r, 0, Math.PI * 2);
              ctx.fillStyle = linear(ctx, 0, y - r, 0, y + r, [
                [0, "#7cd062"],
                [1, "#2f7a38"],
              ]);
              ctx.fill();
            });
          }
          ctx.fillStyle = linear(ctx, 0, 0, 0, 300, [
            [0, "rgba(220, 240, 255, 0.25)"],
            [1, "rgba(220, 240, 255, 0)"],
          ]);
          ctx.fillRect(0, 0, 1600, 300);
        },
      },
      {
        width: 1400,
        height: 230,
        y: 250,
        factor: 0.55,
        paint: (ctx) => {
          const top = ridge(ctx, 1400, 230, 70, 23, [[4, 22], [9, 8]], linear(ctx, 0, 40, 0, 230, [
            [0, "#4cae46"],
            [1, "#1f5a2c"],
          ]));
          const rnd = seededRandom(51);
          for (let i = 0; i < 26; i++) {
            const x = rnd() * 1400;
            const y = top(x) + 4;
            const w = 26 + rnd() * 30;
            wrap(1400, (o) => {
              for (let k = 0; k < 3; k++) {
                ctx.beginPath();
                ctx.arc(x + o + (k - 1) * w * 0.32, y - (k === 1 ? 6 : 0), w * 0.3, 0, Math.PI * 2);
                ctx.fillStyle = linear(ctx, 0, y - w * 0.4, 0, y + w * 0.3, [
                  [0, "#8ee070"],
                  [1, shade("#2f7a38", -0.1)],
                ]);
                ctx.fill();
              }
              for (let k = 0; k < 3; k++) {
                ctx.beginPath();
                ctx.arc(x + o + (rnd() - 0.5) * w * 0.6, y - 4 + rnd() * 6, 1.8, 0, Math.PI * 2);
                ctx.fillStyle = rnd() < 0.5 ? "#fff3a0" : "#ffb8d8";
                ctx.fill();
              }
            });
          }
        },
      },
    ],
  };
}
