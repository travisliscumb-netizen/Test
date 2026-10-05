import { PixelCanvas, seededRandom } from "../indexed";
import { RAMP } from "../palette";
import { cloud, periodicNoise, ridge, wrapped, type Background } from "./layers";

/** Sunny meadow: banded blue sky, drifting clouds, misty mountains, rolling hills. */
export function buildMeadow(): Background {
  const W = 768;

  const clouds = new PixelCanvas(W, 140);
  const rnd = seededRandom(31);
  for (let i = 0; i < 6; i++) {
    const x = Math.floor((i / 6) * W + rnd() * 60);
    const y = 20 + Math.floor(rnd() * 80);
    const w = 70 + Math.floor(rnd() * 60);
    wrapped(W, (o) => cloud(clouds, x + o, y, w, 1, 2));
  }

  const mountains = new PixelCanvas(W, 200);
  ridge(mountains, (x) => 70 + periodicNoise(W, 3, [[2, 30], [5, 14], [11, 5]])(x), 2, 0);
  ridge(mountains, (x) => 70 + periodicNoise(W, 3, [[2, 30], [5, 14], [11, 5]])(x) + 6, 1);
  ridge(mountains, (x) => 120 + periodicNoise(W, 9, [[3, 18], [7, 8]])(x), 3);
  // Snow caps on the tallest peaks.
  const peaks = periodicNoise(W, 3, [[2, 30], [5, 14], [11, 5]]);
  for (let x = 0; x < W; x++) {
    const t = Math.round(70 + peaks(x));
    if (t < 56) mountains.vline(x, t, Math.min(56, t + 6), 4);
  }

  const hills = new PixelCanvas(W, 230);
  const hillTop = periodicNoise(W, 17, [[3, 26], [6, 10]]);
  ridge(hills, (x) => 60 + hillTop(x), 2, 3, 3);
  ridge(hills, (x) => 110 + periodicNoise(W, 23, [[4, 14], [9, 5]])(x), 1, 2, 2);
  // Bushes and flowers dotting the near hills.
  const r2 = seededRandom(41);
  for (let i = 0; i < 18; i++) {
    const x = Math.floor(r2() * W);
    const y = Math.round(110 + periodicNoise(W, 23, [[4, 14], [9, 5]])(x)) - 6;
    wrapped(W, (o) => {
      hills.ellipse(x + o, y, 22, 12, 2);
      hills.ellipse(x + o + 4, y + 1, 10, 5, 3);
      hills.set(x + o + 8, y + 3, 5);
      hills.set(x + o + 14, y + 5, 6);
    });
  }

  return {
    skyBands: ["#4f9ce8", "#5aa8f0", "#68b4f4", "#78c0f6", "#8ccaf8", "#a2d6fa", "#b8e2fc", "#cdecfd"],
    layers: [
      { image: mountains.toImage(), palette: ["transparent", "#8db6d8", "#a9cbe6", "#7aa6c8", "#eef6ff"], factor: 0.12, y: 180 },
      { image: clouds.toImage(), palette: ["transparent", "#ffffff", "#d6e8f6"], factor: 0.25, y: 30, drift: 0.15 },
      {
        image: hills.toImage(),
        palette: ["transparent", RAMP.leaf[1], "#4d9e4a", "#6cbf5a", "#f5803a", "#ffe25a", "#fdf8ec"],
        factor: 0.5,
        y: 250,
      },
    ],
  };
}
