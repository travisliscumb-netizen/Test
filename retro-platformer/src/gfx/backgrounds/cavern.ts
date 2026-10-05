import { PixelCanvas, seededRandom } from "../indexed";
import { periodicNoise, ridge, wrapped, type Background } from "./layers";

/** Underground cavern: hanging stalactites, rock pillars and glowing crystals. */
export function buildCavern(): Background {
  const W = 640;

  const ceiling = new PixelCanvas(W, 150);
  const rnd = seededRandom(51);
  ceiling.rect(0, 0, W, 12, 1);
  for (let i = 0; i < 40; i++) {
    const x = Math.floor(rnd() * W);
    const len = 20 + Math.floor(rnd() * 110);
    const w = 8 + Math.floor(rnd() * 18);
    wrapped(W, (o) => {
      ceiling.polygon([x + o, 0, x + o + w, 0, x + o + w / 2, len], 1);
      ceiling.polygon([x + o + w / 2, 0, x + o + w, 0, x + o + w / 2, len], 2);
    });
  }

  const pillars = new PixelCanvas(W, 350);
  const r2 = seededRandom(61);
  for (let i = 0; i < 7; i++) {
    const x = Math.floor((i / 7) * W + r2() * 40);
    const w = 24 + Math.floor(r2() * 30);
    wrapped(W, (o) => {
      pillars.rect(x + o, 0, w, pillars.height, 1);
      pillars.rect(x + o + Math.floor(w * 0.6), 0, Math.ceil(w * 0.4), pillars.height, 2);
      pillars.vline(x + o + 3, 0, pillars.height - 1, 3);
    });
  }
  ridge(pillars, (x) => 200 + periodicNoise(W, 71, [[3, 20], [8, 8]])(x), 1, 2, 3);
  // Crystals.
  const r3 = seededRandom(81);
  for (let i = 0; i < 14; i++) {
    const x = Math.floor(r3() * W);
    const y = Math.round(200 + periodicNoise(W, 71, [[3, 20], [8, 8]])(x));
    const h = 10 + Math.floor(r3() * 16);
    wrapped(W, (o) => {
      pillars.polygon([x + o - 4, y + 2, x + o, y - h, x + o + 4, y + 2], 4);
      pillars.polygon([x + o, y - h, x + o + 4, y + 2, x + o + 1, y + 2], 5);
      pillars.set(x + o - 1, y - h + 4, 6);
    });
  }

  return {
    skyBands: ["#05060f", "#080a18", "#0b0e20", "#0f1228", "#121630", "#161a38", "#1a1e40", "#1e2248"],
    layers: [
      { image: pillars.toImage(), palette: ["transparent", "#141a30", "#1c2440", "#262f52", "#2fa38f", "#7aead0", "#e0fff6"], factor: 0.3, y: 130 },
      { image: ceiling.toImage(), palette: ["transparent", "#1a2036", "#262e4a"], factor: 0.55, y: 0 },
    ],
  };
}
