// Dev page: renders a whole level as stacked segments. Usage: tools/levels.html?level=1&rows=4&scale=0.5
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

const renderer = new Renderer();
const world = new World(level, newSession(), segW);
const out = document.createElement("canvas");
out.width = Math.round(segW * scale);
out.height = Math.round(VIEW_HEIGHT * scale * rows);
const ctx = out.getContext("2d")!;
for (let i = 0; i < rows; i++) {
  world.camera.x = world.camera.prevX = i * segW;
  const y = Math.round(i * VIEW_HEIGHT * scale);
  const h = Math.round(VIEW_HEIGHT * scale);
  const placement = { x: 0, y, width: out.width, height: h, scale, clip: { x: 0, y, width: out.width, height: h } };
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, y, out.width, h);
  ctx.clip();
  renderer.drawWorld({ ctx, placement, canvasWidth: out.width, canvasHeight: out.height, viewW: segW, insets: { left: 0, right: 0, underTopButtons: false }, alpha: 0 }, world, 0, i !== 0);
  ctx.restore();
}
document.body.append(out);
document.body.dataset.ready = "1";
