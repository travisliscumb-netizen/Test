// Dev page: renders a whole level as stacked segments. Usage: tools/levels.html?level=1&rows=4
import { bakeAssets } from "../src/gfx/assets";
import { Renderer } from "../src/render/renderer";
import { World } from "../src/game/world";
import { newSession } from "../src/game/session";
import { loadLevels } from "../src/levels";
import { TILE, VIEW_HEIGHT } from "../src/tuning";

const params = new URLSearchParams(location.search);
const level = loadLevels()[Number(params.get("level") ?? 1) - 1]!;
const rows = Number(params.get("rows") ?? 4);
const scale = Number(params.get("scale") ?? 0.5);
const segW = Math.ceil((level.width * TILE) / rows);

const renderer = new Renderer(bakeAssets());
const world = new World(level, newSession(), segW);
const frame = document.createElement("canvas");
frame.width = segW;
frame.height = VIEW_HEIGHT;
const fctx = frame.getContext("2d")!;

const out = document.createElement("canvas");
out.width = Math.round(segW * scale);
out.height = Math.round(VIEW_HEIGHT * rows * scale);
const ctx = out.getContext("2d")!;
ctx.imageSmoothingEnabled = scale < 1;
for (let i = 0; i < rows; i++) {
  world.camera.x = world.camera.prevX = i * segW;
  renderer.drawWorld(fctx, world, segW, 0, i !== 0);
  ctx.drawImage(frame, 0, Math.round(i * VIEW_HEIGHT * scale), out.width, Math.round(VIEW_HEIGHT * scale));
}
document.body.append(out);
document.body.dataset.ready = "1";
