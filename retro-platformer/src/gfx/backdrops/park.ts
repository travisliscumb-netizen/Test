import { linear, rgba, seededRandom, shade } from "../paint";
import { cloud, glow, lamp, ridge, tint, tree, wrap } from "./shapes";
import type { Backdrop } from "./types";

/** City park: a pale skyline beyond rolling lawns, a pond, benches and lamps, and leafy hedges up front. */
export function parkBackdrop(): Backdrop {
  return {
    sky: [
      [0, "#4a92dc"],
      [0.5, "#9ad0f2"],
      [1, "#eef8f0"],
    ],
    ambient: { count: 22, color: "#ffd6e8", size: 1.4, vx: 0.3, vy: 0.22, glow: false },
    layers: [
      {
        width: 1600,
        height: 240,
        y: 0,
        factor: 0.02,
        paint: (ctx) =>
          glow(ctx, 380, 70, 220, [
            [0, "rgba(255, 252, 225, 0.9)"],
            [0.12, "rgba(255, 245, 205, 0.6)"],
            [1, "rgba(255, 240, 200, 0)"],
          ]),
      },
      {
        width: 2000,
        height: 200,
        y: 24,
        factor: 0.12,
        drift: 0.12,
        paint: (ctx) => {
          const rnd = seededRandom(401);
          for (let i = 0; i < 6; i++) {
            const x = (i / 6) * 2000 + rnd() * 180;
            wrap(2000, (o) => cloud(ctx, x + o, 40 + rnd() * 70, 90 + rnd() * 90, "#ffffff", "#cfe2f2", 410 + i));
          }
        },
      },
      {
        width: 1800,
        height: 260,
        y: 120,
        factor: 0.07,
        paint: (ctx) => {
          // The city skyline peeking over the trees, pale with distance.
          const rnd = seededRandom(421);
          let x = 0;
          while (x < 1800) {
            const w = 30 + rnd() * 60;
            const h = 60 + rnd() * 150;
            ctx.fillStyle = shade("#b8cce0", (rnd() - 0.5) * 0.1);
            ctx.fillRect(x, 260 - h, w, h);
            x += w + 4 + rnd() * 30;
          }
        },
      },
      {
        width: 1600,
        height: 300,
        y: 190,
        factor: 0.2,
        paint: (ctx) => {
          // Far tree line on rolling hills.
          const top = ridge(ctx, 1600, 300, 70, 431, [[3, 18], [8, 6]], linear(ctx, 0, 40, 0, 300, [
            [0, "#6cb860"],
            [1, "#3f8a48"],
          ]));
          const rnd = seededRandom(433);
          for (let i = 0; i < 60; i++) {
            const x = rnd() * 1600;
            const r = 10 + rnd() * 10;
            wrap(1600, (o) => tree(ctx, x + o, top(x) + 12, r, "#7ccc66", "#2c6c38", "#3a2c20"));
          }
          tint(ctx, "rgba(230, 245, 255, 0.25)", 1600, 300);
        },
      },
      {
        width: 1500,
        height: 260,
        y: 240,
        factor: 0.36,
        paint: (ctx) => {
          // Lawn with a pond, benches and lamps.
          ctx.fillStyle = linear(ctx, 0, 40, 0, 260, [
            [0, "#5cae4c"],
            [1, "#2f7a38"],
          ]);
          ctx.fillRect(0, 40, 1500, 220);
          const rnd = seededRandom(441);
          for (const px of [260, 980]) {
            ctx.beginPath();
            ctx.ellipse(px, 92, 150, 26, 0, 0, Math.PI * 2);
            ctx.fillStyle = linear(ctx, 0, 66, 0, 118, [
              [0, "#a8dcf4"],
              [1, "#3a86b8"],
            ]);
            ctx.fill();
            for (let s = 0; s < 8; s++) {
              ctx.fillStyle = "rgba(255, 255, 255, 0.7)";
              ctx.fillRect(px - 110 + rnd() * 220, 80 + rnd() * 22, 10 + rnd() * 14, 1.2);
            }
          }
          for (let i = 0; i < 6; i++) {
            const x = 80 + i * 250 + rnd() * 40;
            // Park bench.
            ctx.fillStyle = "#6a4426";
            ctx.fillRect(x, 52, 34, 4);
            ctx.fillRect(x, 44, 34, 3);
            ctx.fillStyle = "#2a2a30";
            ctx.fillRect(x + 2, 56, 2, 8);
            ctx.fillRect(x + 30, 56, 2, 8);
            lamp(ctx, x + 70, 64, 56, "#2a3a2e", 0);
          }
          for (let i = 0; i < 14; i++) {
            const x = rnd() * 1500;
            wrap(1500, (o) => tree(ctx, x + o, 60, 16 + rnd() * 8, "#8ad870", "#2a6a34", "#4a3424"));
          }
        },
      },
      {
        width: 1300,
        height: 190,
        y: 290,
        factor: 0.58,
        paint: (ctx) => {
          // Clipped hedges with flowers, filling down to the bottom of the view.
          const top = ridge(ctx, 1300, 190, 70, 451, [[6, 10], [13, 4]], linear(ctx, 0, 50, 0, 190, [
            [0, "#3f9a48"],
            [1, "#123a1c"],
          ]));
          const rnd = seededRandom(453);
          for (let i = 0; i < 70; i++) {
            const x = rnd() * 1300;
            const y = top(x) + 4 + rnd() * 20;
            ctx.beginPath();
            ctx.arc(x, y, 1.8, 0, Math.PI * 2);
            ctx.fillStyle = ["#ffe0f0", "#fff3a0", "#ffffff", "#ff9ab8"][i % 4]!;
            ctx.fill();
          }
          tint(ctx, rgba("#000000", 0.1), 1300, 190);
        },
      },
    ],
  };
}
