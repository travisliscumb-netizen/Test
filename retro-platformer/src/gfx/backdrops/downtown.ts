import { linear, rgba, roundRect, seededRandom, shade, type Ctx } from "../paint";
import { glow, lamp, windows, wrap } from "./shapes";
import type { Backdrop } from "./types";

/** Original, made-up ads only. */
const ADS: readonly (readonly [headline: string, sub: string, bg: string, fg: string])[] = [
  ["BUD FM 101.5", "THE CITY'S BEAT", "#d8262a", "#ffffff"],
  ["NOODLE KING", "OPEN ALL NIGHT", "#ffcc1a", "#2a1a10"],
  ["SODA SPLASH", "ICE COLD", "#1ab0e8", "#ffffff"],
  ["SKY TOURS", "SEE IT FROM ABOVE", "#7a3ad8", "#ffe6ff"],
  ["MEGA MELT", "GRILLED CHEESE", "#ff7a1a", "#2a1a10"],
];

function billboard(ctx: Ctx, x: number, base: number, w: number, h: number, ad: (typeof ADS)[number]): void {
  const top = base - h - 30;
  // Supports and catwalk.
  ctx.fillStyle = "#1a1826";
  ctx.fillRect(x + w * 0.2, top + h, 4, 30);
  ctx.fillRect(x + w * 0.8 - 4, top + h, 4, 30);
  ctx.fillRect(x - 4, top + h + 2, w + 8, 3);
  glow(ctx, x + w / 2, top + h / 2, w * 0.8, [
    [0, rgba(ad[2], 0.45)],
    [1, rgba(ad[2], 0)],
  ]);
  roundRect(ctx, x, top, w, h, 3);
  ctx.fillStyle = linear(ctx, 0, top, 0, top + h, [
    [0, shade(ad[2], 0.2)],
    [1, shade(ad[2], -0.15)],
  ]);
  ctx.fill();
  ctx.strokeStyle = "#0e0c16";
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = ad[3];
  ctx.font = `900 ${Math.round(h * 0.34)}px sans-serif`;
  ctx.fillText(ad[0], x + w / 2, top + h * 0.42, w - 12);
  ctx.font = `700 ${Math.round(h * 0.16)}px sans-serif`;
  ctx.fillText(ad[1], x + w / 2, top + h * 0.75, w - 12);
  // Floodlights on the catwalk.
  for (const lx of [x + w * 0.25, x + w * 0.75]) {
    ctx.fillStyle = "#e8e8f0";
    ctx.fillRect(lx - 3, top + h + 2, 6, 3);
    glow(ctx, lx, top + h - 6, 18, [
      [0, "rgba(255, 250, 220, 0.5)"],
      [1, "rgba(255, 250, 220, 0)"],
    ]);
  }
}

/** Downtown at dusk: a violet sky, towers full of lit windows, glowing rooftop billboards and street lights. */
export function downtownBackdrop(): Backdrop {
  return {
    sky: [
      [0, "#0e0a2a"],
      [0.45, "#3a1a5a"],
      [0.8, "#a8426e"],
      [1, "#f08a6a"],
    ],
    ambient: { count: 30, color: "#ffd8a0", size: 1.1, vx: -0.06, vy: -0.08, glow: true },
    layers: [
      {
        width: 1600,
        height: 220,
        y: 0,
        factor: 0.02,
        paint: (ctx) => {
          const rnd = seededRandom(601);
          for (let i = 0; i < 120; i++) {
            ctx.beginPath();
            ctx.arc(rnd() * 1600, rnd() * 160, rnd() < 0.1 ? 1.2 : 0.5, 0, Math.PI * 2);
            ctx.fillStyle = rgba("#ffffff", 0.3 + rnd() * 0.6);
            ctx.fill();
          }
        },
      },
      {
        width: 1800,
        height: 400,
        y: 80,
        factor: 0.1,
        paint: (ctx) => {
          const rnd = seededRandom(611);
          let x = 0;
          while (x < 1800) {
            const w = 40 + rnd() * 70;
            const h = 150 + rnd() * 230;
            const top = 400 - h;
            ctx.fillStyle = shade("#2a2448", (rnd() - 0.5) * 0.15);
            ctx.fillRect(x, top, w, h);
            if (rnd() < 0.4) {
              ctx.fillRect(x + w / 2 - 1, top - 26, 2, 26);
              glow(ctx, x + w / 2, top - 26, 6, [
                [0, "rgba(255, 60, 60, 0.9)"],
                [1, "rgba(255, 60, 60, 0)"],
              ]);
            }
            windows(ctx, x + 4, top + 6, w - 8, h - 8, rnd, { cols: Math.max(2, Math.round(w / 11)), rows: Math.round(h / 13), lit: "rgba(255, 220, 150, 0.75)", dark: "rgba(40, 36, 70, 0.9)", litChance: 0.35 });
            x += w + rnd() * 8;
          }
          ctx.fillStyle = linear(ctx, 0, 200, 0, 400, [
            [0, "rgba(168, 66, 110, 0)"],
            [1, "rgba(168, 66, 110, 0.4)"],
          ]);
          ctx.fillRect(0, 200, 1800, 200);
        },
      },
      {
        width: 1700,
        height: 320,
        y: 70,
        factor: 0.22,
        paint: (ctx) => {
          // Rooftops carrying the billboards.
          let n = 0;
          for (const [x, w, h] of [
            [60, 220, 150],
            [470, 180, 130],
            [820, 250, 170],
            [1250, 200, 140],
          ] as const) {
            const roof = 320 - h + 60;
            ctx.fillStyle = "#1c1834";
            ctx.fillRect(x - 20, roof, w + 40, 320 - roof);
            windows(ctx, x - 14, roof + 10, w + 28, 320 - roof - 12, seededRandom(x), { cols: Math.round((w + 28) / 14), rows: Math.round((320 - roof) / 16), lit: "#ffd890", dark: "#2a2448", litChance: 0.3 });
            wrap(1700, (o) => billboard(ctx, x + o, roof, w, h * 0.42, ADS[n % ADS.length]!));
            n++;
          }
        },
      },
      {
        width: 1500,
        height: 300,
        y: 180,
        factor: 0.36,
        paint: (ctx) => {
          // Closer towers with vertical neon signs.
          const rnd = seededRandom(631);
          let x = 0;
          let n = 0;
          while (x < 1500) {
            const w = 70 + rnd() * 70;
            const h = 160 + rnd() * 120;
            const top = 300 - h;
            ctx.fillStyle = linear(ctx, x, 0, x + w, 0, [
              [0, "#14122a"],
              [0.4, "#26224a"],
              [1, "#100e22"],
            ]);
            ctx.fillRect(x, top, w, h);
            windows(ctx, x + 6, top + 10, w - 12, h - 14, rnd, { cols: Math.round(w / 16), rows: Math.round(h / 18), lit: "#ffe0a0", dark: "#1e1a3a", litChance: 0.4 });
            if (n % 2 === 0) {
              const neon = ["#ff3aa0", "#3affd8", "#ffd23a"][n % 3]!;
              glow(ctx, x + w - 8, top + 50, 34, [
                [0, rgba(neon, 0.5)],
                [1, rgba(neon, 0)],
              ]);
              roundRect(ctx, x + w - 14, top + 20, 12, 62, 3);
              ctx.fillStyle = "#0a0816";
              ctx.fill();
              ctx.strokeStyle = neon;
              ctx.lineWidth = 1.6;
              ctx.stroke();
              ctx.fillStyle = neon;
              ctx.font = "900 9px sans-serif";
              ctx.textAlign = "center";
              ctx.textBaseline = "middle";
              ["O", "P", "E", "N"].forEach((ch, i) => ctx.fillText(ch, x + w - 8, top + 30 + i * 14));
            }
            x += w + 6 + rnd() * 20;
            n++;
          }
        },
      },
      {
        width: 1300,
        height: 200,
        y: 280,
        factor: 0.56,
        paint: (ctx) => {
          // Street level: lamp posts throwing warm pools of light over a dark street.
          ctx.fillStyle = linear(ctx, 0, 110, 0, 200, [
            [0, "#1c1a2c"],
            [1, "#06050c"],
          ]);
          ctx.fillRect(0, 110, 1300, 90);
          for (let x = 60; x < 1300; x += 220) {
            lamp(ctx, x, 112, 90, "#0e0c18", 0.75);
            glow(ctx, x + 10, 112, 60, [
              [0, "rgba(255, 210, 140, 0.25)"],
              [1, "rgba(255, 210, 140, 0)"],
            ]);
          }
        },
      },
    ],
  };
}
