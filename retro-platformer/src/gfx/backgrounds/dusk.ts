import { PixelCanvas, seededRandom } from "../indexed";
import { cloud, periodicNoise, ridge, wrapped, type Background } from "./layers";

/** Treetops at sunset: a low sun, glowing clouds, mesas and tree silhouettes. */
export function buildDusk(): Background {
  const W = 800;

  // Wider than any view so only one sun is ever on screen.
  const sun = new PixelCanvas(2048, 120);
  sun.ellipse(520, 10, 100, 100, 1);
  sun.ellipse(530, 18, 80, 80, 2);
  for (const y of [70, 80, 88, 95]) sun.rect(500, y, 140, y > 85 ? 3 : 2, 0);

  const clouds = new PixelCanvas(W, 140);
  const rnd = seededRandom(91);
  for (let i = 0; i < 7; i++) {
    const x = Math.floor((i / 7) * W + rnd() * 50);
    const y = 15 + Math.floor(rnd() * 90);
    const w = 60 + Math.floor(rnd() * 70);
    wrapped(W, (o) => cloud(clouds, x + o, y, w, 1, 2));
  }

  const mesas = new PixelCanvas(W, 180);
  const top = periodicNoise(W, 13, [[2, 16], [6, 6]]);
  for (let x = 0; x < W; x++) {
    const plateau = Math.sin((x / W) * Math.PI * 2 * 3) > 0.2 ? -26 : 0;
    const t = Math.round(80 + top(x) + plateau);
    mesas.vline(x, t, 179, 1);
    mesas.vline(x, t, t + 1, 2);
  }

  const trees = new PixelCanvas(W, 240);
  ridge(trees, (x) => 150 + periodicNoise(W, 19, [[5, 8], [13, 3]])(x), 1);
  const r2 = seededRandom(101);
  for (let i = 0; i < 22; i++) {
    const x = Math.floor(r2() * W);
    const h = 50 + Math.floor(r2() * 70);
    const w = 18 + Math.floor(r2() * 16);
    wrapped(W, (o) => {
      const base = 200;
      trees.rect(x + o + w / 2 - 2, base - h, 4, h, 1);
      trees.polygon([x + o, base - h + 30, x + o + w / 2, base - h - 20, x + o + w, base - h + 30], 1);
      trees.polygon([x + o - 4, base - h + 55, x + o + w / 2, base - h + 5, x + o + w + 4, base - h + 55], 1);
    });
  }

  return {
    skyBands: ["#2a1a58", "#3a2368", "#562a74", "#7a3478", "#a64476", "#d05c70", "#f07a64", "#ff9a62", "#ffb870"],
    layers: [
      { image: sun.toImage(), palette: ["transparent", "#ffc070", "#ffe6a0"], factor: 0.04, y: 170 },
      { image: clouds.toImage(), palette: ["transparent", "#ffb6a0", "#c86a8a"], factor: 0.2, y: 40, drift: 0.1 },
      { image: mesas.toImage(), palette: ["transparent", "#6a2e5a", "#a2507a"], factor: 0.15, y: 220 },
      { image: trees.toImage(), palette: ["transparent", "#2c1238"], factor: 0.45, y: 240 },
    ],
  };
}
