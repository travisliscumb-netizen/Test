import { linear, rgba, roundRect, seededRandom, shade } from "../paint";
import { cloud, glow, lamp, tint, tree, windows, wrap } from "./shapes";
import type { Backdrop } from "./types";

const SHOP_SIGNS = ["DELI", "BOOKS", "CAFE", "RECORDS", "BAKERY", "LAUNDRY", "PIZZA", "BARBER", "FLOWERS", "TOYS"];
const FACADES = ["#a8483a", "#c8a07a", "#8aa08a", "#d8c8a8", "#7a5a7a", "#b86a4a", "#6a7a9a"];
const AWNINGS = ["#d8322a", "#2a8a5a", "#2a5aa8", "#e8a020", "#8a3aa0"];

/** Daytime street: a blue sky, a hazy skyline, a row of shops and brownstones, and street trees and lamps. */
export function streetBackdrop(): Backdrop {
  return {
    sky: [
      [0, "#3f86de"],
      [0.55, "#8cc8f4"],
      [1, "#e6f6ff"],
    ],
    ambient: { count: 18, color: "#fffbe8", size: 1.2, vx: 0.2, vy: 0.04, glow: true },
    layers: [
      {
        width: 1600,
        height: 240,
        y: 0,
        factor: 0.02,
        paint: (ctx) => {
          glow(ctx, 1150, 80, 200, [
            [0, "rgba(255, 252, 225, 0.95)"],
            [0.12, "rgba(255, 245, 205, 0.7)"],
            [0.45, "rgba(255, 240, 200, 0.15)"],
            [1, "rgba(255, 240, 200, 0)"],
          ]);
          ctx.beginPath();
          ctx.arc(1150, 80, 24, 0, Math.PI * 2);
          ctx.fillStyle = "#fffdf2";
          ctx.fill();
        },
      },
      {
        width: 2000,
        height: 200,
        y: 20,
        factor: 0.1,
        drift: 0.1,
        paint: (ctx) => {
          const rnd = seededRandom(301);
          for (let i = 0; i < 7; i++) {
            const x = (i / 7) * 2000 + rnd() * 160;
            wrap(2000, (o) => cloud(ctx, x + o, 40 + rnd() * 80, 80 + rnd() * 100, "#ffffff", "#c8def4", 310 + i));
          }
        },
      },
      {
        width: 1800,
        height: 330,
        y: 110,
        factor: 0.1,
        paint: (ctx) => {
          // Distant skyline in atmospheric blue.
          const rnd = seededRandom(321);
          let x = 0;
          while (x < 1800) {
            const w = 40 + rnd() * 70;
            const h = 90 + rnd() * 200;
            const top = 330 - h;
            ctx.fillStyle = shade("#8eaed4", (rnd() - 0.5) * 0.12);
            ctx.fillRect(x, top, w, h);
            if (rnd() < 0.3) ctx.fillRect(x + w / 2 - 1, top - 18, 2, 18);
            windows(ctx, x + 4, top + 8, w - 8, h - 10, rnd, {
              cols: Math.max(2, Math.round(w / 14)),
              rows: Math.round(h / 16),
              lit: "rgba(220, 236, 255, 0.55)",
              dark: "rgba(110, 140, 180, 0.4)",
              litChance: 0.4,
            });
            x += w + rnd() * 10;
          }
          ctx.fillStyle = linear(ctx, 0, 150, 0, 330, [
            [0, "rgba(230, 244, 255, 0)"],
            [1, "rgba(230, 244, 255, 0.75)"],
          ]);
          ctx.fillRect(0, 150, 1800, 180);
        },
      },
      {
        width: 1600,
        height: 300,
        // Shop fronts end at the ground line (y = 416), so they stand on the horizon rather than hide behind the ground.
        y: 116,
        factor: 0.32,
        paint: (ctx) => {
          // A row of shops and brownstones with awnings and signs.
          const rnd = seededRandom(341);
          let x = 0;
          let n = 0;
          while (x < 1600 - 60) {
            const w = Math.min(1600 - x, 80 + rnd() * 60);
            const h = 150 + rnd() * 110;
            const top = 300 - h;
            const color = FACADES[n % FACADES.length]!;
            ctx.fillStyle = linear(ctx, x, 0, x + w, 0, [
              [0, shade(color, -0.12)],
              [0.5, color],
              [1, shade(color, -0.2)],
            ]);
            ctx.fillRect(x, top, w, h);
            // Cornice.
            ctx.fillStyle = shade(color, -0.35);
            ctx.fillRect(x - 3, top, w + 6, 6);
            ctx.fillStyle = shade(color, 0.25);
            ctx.fillRect(x - 3, top, w + 6, 1.5);
            windows(ctx, x + 6, top + 14, w - 12, h - 80, rnd, {
              cols: Math.max(2, Math.round(w / 26)),
              rows: Math.max(1, Math.round((h - 80) / 30)),
              lit: "#fff2c8",
              dark: "#3a5a80",
              litChance: 0.15,
              frame: shade(color, 0.35),
            });
            // Shop front: glass, awning and sign.
            const shopY = 300 - 58;
            ctx.fillStyle = "#2a3448";
            ctx.fillRect(x + 6, shopY + 18, w - 12, 40);
            ctx.fillStyle = "rgba(160, 210, 255, 0.35)";
            ctx.fillRect(x + 8, shopY + 20, (w - 16) * 0.6, 36);
            const awning = AWNINGS[n % AWNINGS.length]!;
            for (let s = 0; s < (w - 4) / 8; s++) {
              ctx.fillStyle = s % 2 === 0 ? awning : "#fbf6ea";
              ctx.beginPath();
              ctx.moveTo(x + 2 + s * 8, shopY + 4);
              ctx.lineTo(x + 2 + (s + 1) * 8, shopY + 4);
              ctx.lineTo(x + 2 + (s + 1) * 8 + 1, shopY + 16);
              ctx.lineTo(x + 2 + s * 8 + 1, shopY + 16);
              ctx.closePath();
              ctx.fill();
            }
            roundRect(ctx, x + w / 2 - 26, shopY - 16, 52, 16, 3);
            ctx.fillStyle = "#1e1a28";
            ctx.fill();
            ctx.font = "bold 10px sans-serif";
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillStyle = "#ffe6a0";
            ctx.fillText(SHOP_SIGNS[n % SHOP_SIGNS.length]!, x + w / 2, shopY - 8);
            x += w;
            n++;
          }
          ctx.fillStyle = shade(FACADES[0]!, -0.2);
          ctx.fillRect(x, 120, 1600 - x, 180);
          // Soft haze to sit the row behind the play layer.
          tint(ctx, "rgba(220, 238, 255, 0.18)", 1600, 300);
        },
      },
      {
        width: 1400,
        height: 210,
        y: 270,
        factor: 0.55,
        paint: (ctx) => {
          // Kerbside trees and lamps, over a dark street that fills any gap below.
          const rnd = seededRandom(361);
          ctx.fillStyle = linear(ctx, 0, 150, 0, 210, [
            [0, "#3a3a46"],
            [1, "#16161e"],
          ]);
          ctx.fillRect(0, 150, 1400, 60);
          for (let i = 0; i < 10; i++) {
            const x = (i / 10) * 1400 + rnd() * 40;
            wrap(1400, (o) => {
              if (i % 2 === 0) tree(ctx, x + o, 152, 18 + rnd() * 6, "#7cc860", "#2f6a34", "#4a3424");
              else lamp(ctx, x + o, 152, 70, "#2a2e3a", 0);
            });
          }
          tint(ctx, rgba("#000000", 0.12), 1400, 210);
        },
      },
    ],
  };
}
