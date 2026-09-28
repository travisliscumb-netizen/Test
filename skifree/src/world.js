// The mountain. A pure function of the seed, generated lazily in square
// chunks around the camera and evicted behind it.
//
// Layers, in placement order:
//   1. Fixed features   - start signs, the slalom / tree slalom / freestyle
//                          courses, the chairlift, the yeti warning signs.
//   2. Region stamps    - hand-shaped set pieces (clearings, jump lines,
//                          narrow passages, snowman families...) placed per
//                          biome region so the slope has landmarks.
//   3. Scatter          - one candidate object per grid cell, drawn from the
//                          local biome's table. Jitter is confined inside the
//                          cell, which is what guarantees minimum spacing.
import { CONFIG, METER } from './config.js';
import { OBJECTS, SIGN, MAX_OBJECT_RADIUS } from './objects.js';
import { Rng, hash, hash01, valueNoise } from './rng.js';

const M = METER;

// fill: chance a cell holds anything. The rest are relative weights.
export const BIOMES = {
  open:   { fill: 0.08, w: { tree_s: 3, tree_m: 2, rock_s: 2, stump: 1, mogul: 2, snowman: 0.15, snowpile: 1.2 } },
  woods:  { fill: 0.44, w: { tree_m: 4, tree_l: 3, tree_s: 2, tree_snowy: 2.5, stump: 0.5, rock_s: 0.3 } },
  glade:  { fill: 0.2,  w: { tree_m: 3, tree_snowy: 2, tree_dead: 1, stump: 1.2, rock_s: 0.6, tree_s: 1, snowpile: 0.6 } },
  rocks:  { fill: 0.22, w: { rock_s: 4, rock_l: 2.5, tree_dead: 1, stump: 0.6, tree_s: 0.5 } },
  moguls: { fill: 0.4,  w: { mogul: 9, tree_s: 0.5, rock_s: 0.4 } },
  park:   { fill: 0.15, w: { ramp: 1.4, mogul: 3, snowman: 0.3, tree_s: 0.6, rock_s: 0.3, snowpile: 1 } },
  wild:   { fill: 0.5,  w: { tree_l: 4, tree_m: 3, tree_snowy: 3, tree_dead: 1, rock_l: 0.5 } },
};
const REGION_BIOMES = { open: 3, woods: 3, glade: 3, rocks: 1.4, moguls: 1.4, park: 1 };

// The three courses from the original's trailhead. Built from config so the
// world, the game rules and the tests all agree on where they are.
export function courses(cfg = CONFIG) {
  return [
    { id: 'slalom', name: 'Slalom', x: cfg.SLALOM_X, half: 12 * M, startY: 22 * M, endY: cfg.COURSE_LENGTH, gates: true },
    { id: 'tree', name: 'Tree Slalom', x: cfg.TREE_SLALOM_X, half: 12 * M, startY: 22 * M, endY: cfg.COURSE_LENGTH, gates: true },
    { id: 'freestyle', name: 'Freestyle', x: cfg.FREESTYLE_X, half: 12 * M, startY: 22 * M, endY: cfg.COURSE_LENGTH, gates: false },
  ];
}

const STAMPS = ['clearing', 'jump_line', 'passage', 'snowmen', 'rock_garden', 'mogul_run', 'dead_grove'];

export class World {
  constructor(seed, cfg = CONFIG) {
    this.seed = seed >>> 0;
    this.cfg = cfg;
    this.chunks = new Map();
    this.regions = new Map();
    this.nextId = 1;
    this.spawnedChunks = new Map(); // key -> cy, chunks that already produced actors
  }

  static key(cx, cy) {
    return cx * 100003 + cy; // unique for |cx| < 50000
  }

  chunk(cx, cy) {
    const k = World.key(cx, cy);
    let c = this.chunks.get(k);
    if (!c) {
      c = this.generateChunk(cx, cy);
      this.chunks.set(k, c);
    }
    return c;
  }

  // Generates everything overlapping the rect (+ margin) and drops chunks far
  // outside it. Returns chunks created for the first time this run, so the
  // game can populate them with actors exactly once.
  update(x0, y0, x1, y1) {
    const { CHUNK_SIZE: S, GENERATE_MARGIN: G, EVICT_MARGIN: E } = this.cfg;
    const fresh = [];
    const cx0 = Math.floor((x0 - G) / S), cx1 = Math.floor((x1 + G) / S);
    const cy0 = Math.floor((y0 - G) / S), cy1 = Math.floor((y1 + G) / S);
    for (let cy = cy0; cy <= cy1; cy++) {
      for (let cx = cx0; cx <= cx1; cx++) {
        const c = this.chunk(cx, cy);
        const k = World.key(cx, cy);
        if (!this.spawnedChunks.has(k)) {
          this.spawnedChunks.set(k, cy);
          fresh.push(c);
        }
      }
    }
    for (const [k, c] of this.chunks) {
      const bx0 = c.cx * S, by0 = c.cy * S;
      if (bx0 + S < x0 - E || bx0 > x1 + E || by0 + S < y0 - E || by0 > y1 + E) this.chunks.delete(k);
    }
    // Chunks far uphill can never be reached again at skiing speed; forget them
    // so a very long run doesn't grow this map without bound.
    if (this.spawnedChunks.size > 3000) {
      const minCy = Math.floor((y0 - E * 3) / S);
      for (const [k, cy] of this.spawnedChunks) if (cy < minCy) this.spawnedChunks.delete(k);
    }
    if (this.regions.size > 256) this.regions.clear();
    return fresh;
  }

  // Calls fn(obj) for every object whose centre lies within the padded rect.
  forEachInRect(x0, y0, x1, y1, fn) {
    const S = this.cfg.CHUNK_SIZE;
    const cx0 = Math.floor(x0 / S), cx1 = Math.floor(x1 / S);
    const cy0 = Math.floor(y0 / S), cy1 = Math.floor(y1 / S);
    for (let cy = cy0; cy <= cy1; cy++) {
      for (let cx = cx0; cx <= cx1; cx++) {
        const objs = this.chunk(cx, cy).objects;
        for (let i = 0; i < objs.length; i++) {
          const o = objs[i];
          if (o.x >= x0 && o.x <= x1 && o.y >= y0 && o.y <= y1) fn(o);
        }
      }
    }
  }

  // Calls fn(obj, dist) for objects whose footprint overlaps the circle.
  forEachNear(x, y, r, fn) {
    const pad = r + MAX_OBJECT_RADIUS;
    this.forEachInRect(x - pad, y - pad, x + pad, y + pad, (o) => {
      const d = Math.hypot(o.x - x, o.y - y);
      if (d < r + OBJECTS[o.t].r) fn(o, d);
    });
  }

  // True when no solid object sits within r of the point.
  isFree(x, y, r) {
    let free = true;
    this.forEachNear(x, y, r, (o) => {
      if (OBJECTS[o.t].solid || o.t === 'ramp') free = false;
    });
    return free;
  }

  // ------------------------------------------------------------- biomes

  depthFactor(y) {
    const d = y / (this.cfg.DENSITY_RAMP_METERS * M);
    return 0.55 + 0.45 * Math.min(1, Math.max(0, d));
  }

  regionBiome(rx, ry) {
    const rng = new Rng(hash(this.seed, rx, ry, 11));
    return rng.weighted(REGION_BIOMES);
  }

  biomeAt(x, y) {
    const cfg = this.cfg;
    if (Math.abs(x) > cfg.WORLD_SIZE / 2) return 'wild';
    if (this.inFreestyle(x, y)) return 'park';
    if (this.inTreeSlalom(x, y)) return 'glade';
    const R = cfg.REGION_CHUNKS * cfg.CHUNK_SIZE;
    // Domain warp so biome borders meander instead of following the grid.
    const wx = x + (valueNoise(this.seed ^ 0x51, x / 900, y / 900) - 0.5) * R * 0.7;
    const wy = y + (valueNoise(this.seed ^ 0xa3, x / 900, y / 900) - 0.5) * R * 0.7;
    const b = this.regionBiome(Math.floor(wx / R), Math.floor(wy / R));
    // The first stretch below the start is always friendly terrain.
    if (y < cfg.START_EASY && Math.abs(x) < cfg.START_EASY * 1.5 && b !== 'open' && b !== 'park') return 'glade';
    return b;
  }

  // --------------------------------------------------------- start area

  inStart(x, y) {
    return Math.hypot(x, y) < this.cfg.START_CLEAR_RADIUS;
  }
  inCourseDepth(y) {
    return y > 20 * M && y < this.cfg.COURSE_LENGTH;
  }
  inSlalomLane(x, y) {
    return this.inCourseDepth(y) && Math.abs(x - this.cfg.SLALOM_X) < 14 * M;
  }
  inTreeSlalom(x, y) {
    return this.inCourseDepth(y) && Math.abs(x - this.cfg.TREE_SLALOM_X) < 24 * M;
  }
  inFreestyle(x, y) {
    return this.inCourseDepth(y) && Math.abs(x - this.cfg.FREESTYLE_X) < 34 * M;
  }
  inLiftLane(x, y) {
    return y > -40 * M && y < this.liftEnd() + 20 * M && Math.abs(x - this.cfg.LIFT_X) < 3 * M;
  }
  liftEnd() {
    return 1500 * M;
  }
  inCourses(x, y) {
    return this.inSlalomLane(x, y) || this.inTreeSlalom(x, y) || this.inFreestyle(x, y);
  }

  // Fixed, hand-authored features that fall inside [x0,x1) x [y0,y1).
  fixedFeatures(x0, y0, x1, y1, push) {
    const cfg = this.cfg;
    const inside = (x, y) => x >= x0 && x < x1 && y >= y0 && y < y1;
    const put = (t, x, y, v = 0) => inside(x, y) && push(t, x, y, v);

    // Trailhead signs pointing at the three courses.
    put('sign', -5 * M, -6 * M, SIGN.SKIFREE);
    put('sign', cfg.SLALOM_X + 4 * M, 12 * M, SIGN.SLALOM);
    put('sign', cfg.TREE_SLALOM_X + 4 * M, 12 * M, SIGN['TREE SLALOM']);
    put('sign', cfg.FREESTYLE_X - 6 * M, 12 * M, SIGN.FREESTYLE);

    // Slalom: alternating gates weaving across the lane.
    const gateFirst = 30 * M, gateStep = 17 * M;
    for (let i = 0, y = gateFirst; y < cfg.COURSE_LENGTH; i++, y += gateStep) {
      if (y + 4 * M < y0 || y - 4 * M > y1) continue;
      const cx = cfg.SLALOM_X + (i % 2 ? 1 : -1) * 6 * M;
      const flag = i % 2 ? 'flag_red' : 'flag_blue';
      const half = 3.6 * M;
      put(flag, cx - half, y);
      put(flag, cx + half, y);
      if (inside(cx, y)) push('gate', cx, y, half * 2);
    }
    // Tree slalom: narrower gates threaded through glade trees.
    for (let i = 0, y = gateFirst + 8 * M; y < cfg.COURSE_LENGTH; i++, y += 22 * M) {
      if (y + 4 * M < y0 || y - 4 * M > y1) continue;
      const cx = cfg.TREE_SLALOM_X + (i % 2 ? 1 : -1) * 7 * M;
      const flag = i % 2 ? 'flag_red' : 'flag_blue';
      const half = 3 * M;
      put(flag, cx - half, y);
      put(flag, cx + half, y);
      if (inside(cx, y)) push('gate', cx, y, half * 2);
    }
    // START and FINISH arches over each course (v: 0 start, 1 finish).
    for (const c of courses(cfg)) {
      put('banner', c.x, c.startY, 0);
      put('banner', c.x, c.endY, 1);
    }

    // Chairlift towers.
    const sp = cfg.LIFT_TOWER_SPACING;
    for (let k = Math.max(0, Math.floor(y0 / sp)); k * sp < y1 && k * sp <= this.liftEnd(); k++) {
      put('lift_tower', cfg.LIFT_X, k * sp);
    }

    // A line of warning signs shortly before the yeti's territory.
    const warnY = (cfg.YETI_TRIGGER_DISTANCE - 140) * M;
    if (warnY >= y0 && warnY < y1) {
      // Signs sit at k*170m + 23m; start the scan early enough to catch the
      // one whose base lies in the previous chunk.
      const step = 170 * M, off = 23 * M;
      for (let x = Math.ceil((x0 - off) / step) * step; x + off < x1; x += step) {
        if (Math.abs(x) < cfg.WORLD_SIZE / 2) put('sign', x + off, warnY, SIGN['YETI XING']);
      }
    }
  }

  // ------------------------------------------------------------- stamps

  // Returns { objects: [...], holes: [{x,y,r}] } for a biome region.
  regionStamps(rx, ry) {
    const k = World.key(rx, ry);
    let reg = this.regions.get(k);
    if (reg) return reg;
    reg = { objects: [], holes: [] };
    this.regions.set(k, reg);

    const cfg = this.cfg;
    const R = cfg.REGION_CHUNKS * cfg.CHUNK_SIZE;
    const rng = new Rng(hash(this.seed, rx, ry, 23));
    const count = rng.int(1, 3);
    const edge = 30; // keeps stamps from neighbouring regions >= 2*edge apart
    const bx0 = rx * R + edge, bx1 = (rx + 1) * R - edge;
    const by0 = ry * R + edge, by1 = (ry + 1) * R - edge;
    for (let s = 0; s < count; s++) {
      const kind = rng.pick(STAMPS);
      const ox = rx * R + rng.range(200, R - 200);
      const oy = ry * R + rng.range(200, R - 200);
      if (Math.abs(ox) > cfg.WORLD_SIZE / 2 - 200) continue;
      if (oy < cfg.START_CLEAR_RADIUS + 300) continue;
      if (oy < cfg.COURSE_LENGTH + 40 * M && Math.abs(ox) < 180 * M) continue;
      if (Math.abs(ox - cfg.LIFT_X) < 300 && oy < this.liftEnd() + 400) continue;
      if (Math.abs(oy - (cfg.YETI_TRIGGER_DISTANCE - 140) * M) < 500) continue;

      // Build tentatively, then keep it only if it fits: every object inside
      // its hole, the hole inside the region, and clear of other stamps.
      const nObj = reg.objects.length, nHole = reg.holes.length;
      this.buildStamp(kind, ox, oy, rng, reg);
      const h = reg.holes[nHole];
      const ok =
        h &&
        reg.holes.length === nHole + 1 &&
        h.x - h.r >= bx0 && h.x + h.r <= bx1 && h.y - h.r >= by0 && h.y + h.r <= by1 &&
        reg.objects.slice(nObj).every((o) => Math.hypot(o.x - h.x, o.y - h.y) <= h.r) &&
        reg.holes.slice(0, nHole).every((o) => Math.hypot(o.x - h.x, o.y - h.y) > o.r + h.r + 60);
      if (!ok) {
        reg.objects.length = nObj;
        reg.holes.length = nHole;
      }
    }
    return reg;
  }

  buildStamp(kind, ox, oy, rng, reg) {
    const add = (t, x, y, v = 0) => reg.objects.push({ t, x, y, v });
    switch (kind) {
      case 'clearing': {
        // A ring of big trees with a snowman keeping watch in the middle.
        const r = rng.range(90, 130);
        const n = Math.floor((Math.PI * 2 * r) / 46);
        const gap = rng.int(0, n - 1);
        for (let i = 0; i < n; i++) {
          if (i === gap || i === (gap + 1) % n || i === (gap + Math.floor(n / 2)) % n) continue;
          const a = (i / n) * Math.PI * 2;
          add(rng.chance(0.5) ? 'tree_l' : 'tree_snowy', ox + Math.cos(a) * r, oy + Math.sin(a) * r);
        }
        if (rng.chance(0.7)) add('snowman', ox, oy);
        reg.holes.push({ x: ox, y: oy, r: r + 40 });
        break;
      }
      case 'jump_line': {
        // Three ramps stacked downhill: hit them all at speed.
        for (let i = 0; i < 3; i++) {
          add('ramp', ox + rng.range(-12, 12), oy + i * 230);
          add('mogul', ox - 70, oy + i * 230 + 60);
          add('mogul', ox + 70, oy + i * 230 + 60);
        }
        reg.holes.push({ x: ox, y: oy + 230, r: 330 });
        break;
      }
      case 'passage': {
        // A wall of trees across the slope with one narrow gap and one wide one.
        const half = rng.int(6, 9);
        const narrow = rng.int(-half + 1, half - 2);
        const wide = narrow > 0 ? narrow - rng.int(3, 4) : narrow + rng.int(3, 5);
        for (let i = -half; i <= half; i++) {
          if (i === narrow || i === wide || i === wide + 1) continue;
          add(rng.chance(0.6) ? 'tree_m' : 'tree_snowy', ox + i * 46, oy + rng.range(-5, 5));
        }
        reg.holes.push({ x: ox, y: oy, r: (half + 1) * 46 });
        break;
      }
      case 'snowmen': {
        const n = rng.int(3, 5);
        // 44u apart (+/-3): with r=9 that leaves >= 20u between them.
        for (let i = 0; i < n; i++) add('snowman', ox + (i - n / 2) * 44 + rng.range(-3, 3), oy + rng.range(-20, 20), i);
        reg.holes.push({ x: ox, y: oy, r: n * 24 + 40 });
        break;
      }
      case 'rock_garden': {
        for (let i = 0; i < 9; i++) {
          const a = rng.range(0, Math.PI * 2);
          const d = rng.range(0, 140);
          const x = ox + Math.cos(a) * d, y = oy + Math.sin(a) * d;
          if (reg.objects.some((o) => Math.hypot(o.x - x, o.y - y) < 48)) continue;
          add(rng.chance(0.4) ? 'rock_l' : 'rock_s', x, y);
        }
        reg.holes.push({ x: ox, y: oy, r: 180 });
        break;
      }
      case 'mogul_run': {
        for (let row = 0; row < 7; row++) {
          for (let col = -2; col <= 2; col++) {
            add('mogul', ox + col * 52 + (row % 2) * 26, oy + row * 48);
          }
        }
        reg.holes.push({ x: ox, y: oy + 150, r: 210 });
        break;
      }
      case 'dead_grove': {
        for (let i = 0; i < 8; i++) {
          const x = ox + rng.range(-120, 120), y = oy + rng.range(-100, 100);
          if (reg.objects.some((o) => Math.hypot(o.x - x, o.y - y) < 44)) continue;
          add(rng.chance(0.75) ? 'tree_dead' : 'stump', x, y);
        }
        reg.holes.push({ x: ox, y: oy, r: 160 });
        break;
      }
    }
  }

  // --------------------------------------------------------- generation

  generateChunk(cx, cy) {
    const cfg = this.cfg;
    const S = cfg.CHUNK_SIZE;
    const x0 = cx * S, y0 = cy * S, x1 = x0 + S, y1 = y0 + S;
    const objects = [];
    const push = (t, x, y, v = 0) => {
      objects.push({ id: this.nextId++, t, x, y, v, state: 0, timer: 0 });
    };

    this.fixedFeatures(x0, y0, x1, y1, push);

    // Stamps may spill over region borders, so look at the 3x3 neighbourhood.
    const R = cfg.REGION_CHUNKS * S;
    const rx = Math.floor(x0 / R), ry = Math.floor(y0 / R);
    const neighbourRegions = [];
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) neighbourRegions.push(this.regionStamps(rx + dx, ry + dy));
    for (const reg of neighbourRegions) {
      for (const o of reg.objects) {
        if (o.x >= x0 && o.x < x1 && o.y >= y0 && o.y < y1) push(o.t, o.x, o.y, o.v);
      }
    }

    // Scatter. Anything placed deliberately (fixed features and stamps, from
    // this chunk or overlapping in from a neighbour) blocks scatter within the
    // minimum spacing, so the spacing guarantee holds across every layer.
    const C = cfg.CELL_SIZE;
    const jit = C / 2 - cfg.CELL_MARGIN;
    const gap = cfg.CELL_MARGIN * 2;
    const pad = gap + 100;
    const blockers = [];
    this.fixedFeatures(x0 - pad, y0 - pad, x1 + pad, y1 + pad, (t, x, y, v) => blockers.push({ t, x, y, v }));
    for (const reg of neighbourRegions) for (const o of reg.objects) blockers.push(o);
    const holes = neighbourRegions.flatMap((r) => r.holes);
    const blocked = (x, y) => {
      for (const b of blockers) {
        const dx = Math.abs(b.x - x), dy = Math.abs(b.y - y);
        // Gates keep a generous box clear so the line through them is skiable;
        // arches keep their two poles clear.
        if (b.t === 'gate') {
          if (dx < b.v / 2 + 60 && dy < 70) return true;
        } else if (b.t === 'banner') {
          if (dy < 50 && Math.abs(dx - 12 * M) < 40) return true;
        } else if (dx < gap && dy < gap && Math.hypot(dx, dy) < gap) return true;
      }
      for (const h of holes) if (Math.hypot(h.x - x, h.y - y) < h.r + gap) return true;
      return false;
    };

    for (let gy = y0 + C / 2; gy < y1; gy += C) {
      for (let gx = x0 + C / 2; gx < x1; gx += C) {
        const gix = Math.floor(gx / C), giy = Math.floor(gy / C);
        const rng = new Rng(hash(this.seed, gix, giy, 5));
        const x = gx + rng.range(-jit, jit);
        const y = gy + rng.range(-jit, jit);
        if (this.inStart(x, y) || this.inLiftLane(x, y) || this.inSlalomLane(x, y)) continue;
        if (blocked(x, y)) continue;
        // Warning-sign row stays clear so the signs read.
        if (Math.abs(y - (cfg.YETI_TRIGGER_DISTANCE - 140) * M) < 40) continue;

        const name = this.biomeAt(x, y);
        const biome = BIOMES[name];
        // Low-frequency density wobble: thick and thin patches inside a biome.
        const wobble = 0.6 + 0.8 * valueNoise(this.seed ^ 0x77, x / 700, y / 700);
        let fill = biome.fill * wobble * cfg.OBJECT_DENSITY;
        if (name !== 'wild') fill *= this.depthFactor(y);
        if (y < 0) fill *= 0.6; // a little lighter above the start
        if (!rng.chance(fill)) continue;
        let t = rng.weighted(biome.w);
        if (name === 'park' && this.inFreestyle(x, y)) t = rng.weighted({ ramp: 1.6, mogul: 4, tree_s: 0.3 });
        push(t, x, y, rng.int(0, 3));
      }
    }

    // Deterministic draw order within the chunk; renderer sorts globally anyway.
    objects.sort((a, b) => a.y - b.y);
    return { cx, cy, objects, seedHash: hash01(this.seed, cx, cy, 99) };
  }
}
