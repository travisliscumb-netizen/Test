import { linear, rgba, seededRandom } from "../paint";
import { cloud, glow, ridge, wrap } from "./shapes";
import type { Backdrop } from "./types";

/** Sunset canopy: a huge low sun, rose-lit clouds, violet mesas and dark treetops. */
export function duskBackdrop(): Backdrop {
  return {
    sky: [
      [0, "#241650"],
      [0.35, "#6a2c78"],
      [0.6, "#d0566e"],
      [0.82, "#ff9a62"],
      [1, "#ffd08a"],
    ],
    ambient: { count: 30, color: "#ffe08a", size: 1.6, vx: 0.12, vy: -0.06, glow: true },
    layers: [
      {
        width: 1600,
        height: 480,
        y: 0,
        factor: 0.03,
        paint: (ctx) => {
          glow(ctx, 1000, 300, 360, [
            [0, "rgba(255, 236, 170, 0.9)"],
            [0.15, "rgba(255, 190, 120, 0.6)"],
            [0.5, "rgba(255, 130, 110, 0.15)"],
            [1, "rgba(255, 130, 110, 0)"],
          ]);
          ctx.beginPath();
          ctx.arc(1000, 300, 70, 0, Math.PI * 2);
          ctx.fillStyle = linear(ctx, 0, 230, 0, 370, [
            [0, "#fff6d0"],
            [1, "#ffb060"],
          ]);
          ctx.fill();
          // Heat bands across the sun.
          ctx.fillStyle = rgba("#ff8a5a", 0.5);
          for (const [y, h] of [
            [320, 3],
            [334, 4],
            [348, 5],
          ] as const) ctx.fillRect(920, y, 160, h);
        },
      },
      {
        width: 2000,
        height: 240,
        y: 20,
        factor: 0.14,
        drift: 0.08,
        paint: (ctx) => {
          const rnd = seededRandom(91);
          for (let i = 0; i < 8; i++) {
            const x = (i / 8) * 2000 + rnd() * 140;
            const y = 40 + rnd() * 130;
            const w = 80 + rnd() * 120;
            wrap(2000, (o) => cloud(ctx, x + o, y, w, "#ffc6b0", "#9a4a7a", 200 + i));
          }
        },
      },
      {
        width: 1700,
        height: 300,
        y: 200,
        factor: 0.18,
        paint: (ctx) => {
          const top = ridge(ctx, 1700, 300, 90, 13, [[3, 30], [8, 10]], linear(ctx, 0, 40, 0, 300, [
            [0, "#7a3a7a"],
            [1, "#3a1a4a"],
          ]));
          // Sun-lit rims on the mesa tops.
          ctx.strokeStyle = rgba("#ffb080", 0.7);
          ctx.lineWidth = 2;
          ctx.beginPath();
          for (let x = 0; x <= 1700; x += 4) {
            if (x === 0) ctx.moveTo(x, top(x) + 1);
            else ctx.lineTo(x, top(x) + 1);
          }
          ctx.stroke();
        },
      },
      {
        width: 1400,
        height: 260,
        y: 220,
        factor: 0.45,
        paint: (ctx) => {
          ridge(ctx, 1400, 260, 150, 19, [[5, 10], [13, 4]], "#26103a");
          const rnd = seededRandom(101);
          for (let i = 0; i < 30; i++) {
            const x = rnd() * 1400;
            const h = 60 + rnd() * 100;
            const w = 22 + rnd() * 22;
            wrap(1400, (o) => {
              ctx.fillStyle = "#26103a";
              ctx.fillRect(x + o - 2, 260 - h, 4, h);
              for (let k = 0; k < 3; k++) {
                const ty = 260 - h + k * 18;
                const tw = w * (0.5 + k * 0.25);
                ctx.beginPath();
                ctx.moveTo(x + o - tw / 2, ty + 26);
                ctx.lineTo(x + o, ty - 8);
                ctx.lineTo(x + o + tw / 2, ty + 26);
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
