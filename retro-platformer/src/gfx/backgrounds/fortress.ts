import { PixelCanvas, seededRandom } from "../indexed";
import { periodicNoise, ridge, wrapped, type Background } from "./layers";

/** Night fortress: starfield, a pale moon, distant towers and dark ramparts. */
export function buildFortress(): Background {
  const W = 720;

  // Wider than any view so only one moon is ever on screen.
  const stars = new PixelCanvas(1600, 240);
  const rnd = seededRandom(111);
  for (let i = 0; i < 200; i++) {
    const x = Math.floor(rnd() * stars.width);
    const y = Math.floor(rnd() * 240);
    stars.set(x, y, rnd() < 0.2 ? 2 : 1);
    if (rnd() < 0.08) {
      stars.set(x - 1, y, 1);
      stars.set(x + 1, y, 1);
      stars.set(x, y - 1, 1);
      stars.set(x, y + 1, 1);
      stars.set(x, y, 2);
    }
  }
  // Crescent moon.
  stars.ellipse(120, 30, 56, 56, 3);
  stars.ellipse(122, 34, 30, 30, 4);
  stars.ellipse(136, 30, 50, 50, 0);

  const towers = new PixelCanvas(W, 230);
  ridge(towers, (x) => 170 + periodicNoise(W, 7, [[2, 12], [5, 6]])(x), 1);
  const r2 = seededRandom(121);
  for (let i = 0; i < 6; i++) {
    const x = Math.floor((i / 6) * W + r2() * 50);
    const w = 30 + Math.floor(r2() * 24);
    const h = 90 + Math.floor(r2() * 90);
    wrapped(W, (o) => {
      towers.rect(x + o, 230 - h, w, h, 1);
      for (let cx = 0; cx < w; cx += 8) towers.rect(x + o + cx, 230 - h - 6, 5, 6, 1);
      towers.polygon([x + o - 4, 230 - h - 6, x + o + w / 2, 230 - h - 46, x + o + w + 4, 230 - h - 6], 1);
      for (let wy = 230 - h + 16; wy < 200; wy += 26) towers.rect(x + o + w / 2 - 2, wy, 4, 8, 2);
    });
  }

  const ramparts = new PixelCanvas(W, 180);
  ridge(ramparts, (x) => 70 + periodicNoise(W, 131, [[3, 10], [7, 4]])(x), 1);
  for (let x = 0; x < W; x += 24) {
    const t = Math.round(70 + periodicNoise(W, 131, [[3, 10], [7, 4]])(x));
    ramparts.rect(x, t - 8, 12, 8, 1);
  }
  ramparts.hline(0, W - 1, 100, 2);

  return {
    skyBands: ["#05060e", "#070914", "#0c0d20", "#12122c", "#1a1638", "#221a44", "#2a2050"],
    layers: [
      { image: stars.toImage(), palette: ["transparent", "#8a90c0", "#fdf8ec", "#e8e2c0", "#fffbe6"], factor: 0.02, y: 0 },
      { image: towers.toImage(), palette: ["transparent", "#1a1830", "#f2c860"], factor: 0.15, y: 160 },
      { image: ramparts.toImage(), palette: ["transparent", "#100e1c", "#1c1830"], factor: 0.45, y: 300 },
    ],
  };
}
