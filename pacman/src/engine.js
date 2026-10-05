/* Game simulation. Pure and deterministic: no DOM, no wall clock.

   One call to step() is one arcade frame (1/60 s). Behaviour follows the
   original hardware as documented in Jamey Pittman's "Pac-Man Dossier":
   per-level speed and fright tables, the scatter/chase schedule, the four
   targeting personalities (including the up-direction overflow bug that skews
   Pinky's and Inky's aim), red-zone tiles, dot-counter and idle-timer ghost
   release, Cruise Elroy, one- and three-frame dot stalls, and cornering. */

import * as M from './maze.js';

export const FPS = 60;
export const MAX_SPEED = 75.757575 / FPS;           // px per frame at "100%"

export const DIR = { NONE: -1, UP: 0, LEFT: 1, DOWN: 2, RIGHT: 3 };
export const DX = [0, -1, 0, 1];
export const DY = [-1, 0, 1, 0];
export const opposite = (d) => (d < 0 ? d : (d + 2) % 4);

export const FRUITS = [
  { kind: 'cherry', points: 100 },
  { kind: 'strawberry', points: 300 },
  { kind: 'orange', points: 500 },
  { kind: 'apple', points: 700 },
  { kind: 'melon', points: 1000 },
  { kind: 'galaxian', points: 2000 },
  { kind: 'bell', points: 3000 },
  { kind: 'key', points: 5000 }
];

const FRIGHT = [
  [6, 5], [5, 5], [4, 5], [3, 5], [2, 5], [5, 5], [2, 5], [2, 5], [1, 3], [5, 5],
  [2, 5], [1, 3], [1, 3], [3, 5], [1, 3], [1, 3], [0, 0], [1, 3]
];
const ELROY_DOTS = [20, 30, 40, 40, 40, 50, 50, 50, 60, 60, 60, 80, 80, 80, 100, 100, 100, 100];
export const FLASH_FRAMES = 28;                    // one white+blue blink
/* The fruit row under the maze: this level's fruit and up to six before it. */
export function fruitShelf(level) {
  const out = [];
  for (let l = Math.max(1, level - 6); l <= level; l++) out.push(fruitForLevel(l).kind);
  return out;
}

export const INTERMISSION_AFTER = new Set([2, 5, 9, 13, 17]);
export const EXTRA_LIFE_AT = 10000;

export function fruitForLevel(level) {
  const idx = level <= 1 ? 0 : level === 2 ? 1 : level <= 4 ? 2 : level <= 6 ? 3
    : level <= 8 ? 4 : level <= 10 ? 5 : level <= 12 ? 6 : 7;
  return FRUITS[idx];
}

export function levelSpec(level) {
  let s;
  if (level === 1) s = { pac: 0.80, pacF: 0.90, ghost: 0.75, ghostF: 0.50, tunnel: 0.40, elroy1: 0.80, elroy2: 0.85 };
  else if (level <= 4) s = { pac: 0.90, pacF: 0.95, ghost: 0.85, ghostF: 0.55, tunnel: 0.45, elroy1: 0.90, elroy2: 0.95 };
  else if (level <= 20) s = { pac: 1.00, pacF: 1.00, ghost: 0.95, ghostF: 0.60, tunnel: 0.50, elroy1: 1.00, elroy2: 1.05 };
  else s = { pac: 0.90, pacF: 0.90, ghost: 0.95, ghostF: 0.60, tunnel: 0.50, elroy1: 1.00, elroy2: 1.05 };

  const [frightSec, flashes] = FRIGHT[level - 1] || [0, 0];
  const elroy1Dots = ELROY_DOTS[level - 1] ?? 120;
  const sec = (v) => Math.round(v * FPS);
  const modes = level === 1 ? [7, 20, 7, 20, 5, 20, 5, Infinity]
    : level <= 4 ? [7, 20, 7, 20, 5, 1033, 1 / 60, Infinity]
      : [5, 20, 5, 20, 5, 1037, 1 / 60, Infinity];

  return {
    speed: Object.fromEntries(Object.entries(s).map(([k, v]) => [k, v * MAX_SPEED])),
    frightFrames: sec(frightSec),
    flashes,
    elroy1Dots,
    elroy2Dots: elroy1Dots / 2,
    modeFrames: modes.map((v) => (v === Infinity ? Infinity : Math.max(1, sec(v)))),
    houseLimits: level === 1 ? [0, 30, 60] : level === 2 ? [0, 0, 50] : [0, 0, 0],
    idleLimit: level <= 4 ? sec(4) : sec(3),
    fruit: fruitForLevel(level)
  };
}

const HOUSE_SPEED = 0.5 * MAX_SPEED;
const EYES_SPEED = 1.6 * MAX_SPEED;
const HOUSE_TOP = M.HOUSE_CENTER_Y - 4;
const HOUSE_BOTTOM = M.HOUSE_CENTER_Y + 4;

const GHOSTS = [
  { name: 'blinky', x: M.HOUSE_DOOR_X, y: M.HOUSE_EXIT_Y, dir: DIR.LEFT, state: 'active', home: M.HOUSE_DOOR_X, scatter: [25, -3] },
  { name: 'pinky', x: M.HOUSE_DOOR_X, y: M.HOUSE_CENTER_Y, dir: DIR.DOWN, state: 'house', home: M.HOUSE_DOOR_X, scatter: [2, -3] },
  { name: 'inky', x: M.HOUSE_DOOR_X - 16, y: M.HOUSE_CENTER_Y, dir: DIR.UP, state: 'house', home: M.HOUSE_DOOR_X - 16, scatter: [27, 31] },
  { name: 'clyde', x: M.HOUSE_DOOR_X + 16, y: M.HOUSE_CENTER_Y, dir: DIR.UP, state: 'house', home: M.HOUSE_DOOR_X + 16, scatter: [0, 31] }
];

export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const tileKey = (c, r) => `${c},${r}`;
const inTunnel = (c, r) => {
  if (r !== M.TUNNEL_ROW) return false;
  const n = ((c + M.TUNNEL_EXTRA) % 32 + 32) % 32 - M.TUNNEL_EXTRA;
  return n <= 5 || n >= 22;
};

export class Game {
  constructor({ seed = 1, startLevel = 1, invincible = false } = {}) {
    this.rand = mulberry32(seed);
    this.startLevelNum = startLevel;
    this.invincible = invincible;
    this.events = [];
    this.newGame();
  }

  emit(type, data = {}) { this.events.push({ type, ...data }); }
  drainEvents() { const e = this.events; this.events = []; return e; }

  newGame() {
    this.score = 0;
    this.lives = 2;                  // in reserve; the one in play is not counted
    this.level = this.startLevelNum;
    this.extraLifeAwarded = false;
    this.tick = 0;
    /* Lifetime counters for the results screen; never read by the rules. */
    this.stats = { dots: 0, ghosts: 0, bestCombo: 0, fruit: 0, frames: 0 };
    this.startLevel(true);
  }

  startLevel(first = false) {
    this.spec = levelSpec(this.level);
    this.items = M.BASE_ITEMS.slice();
    this.dotsEaten = 0;
    this.dotsLeft = M.TOTAL_DOTS;
    this.houseCounters = [0, 0, 0];
    this.globalCounterOn = false;
    this.globalCounter = 0;
    this.elroySuspended = false;
    this.resetActors();
    this.setPhase('ready', first ? 252 : 120);
    this.emit(first ? 'gameStart' : 'levelStart', { level: this.level });
  }

  resetActors() {
    this.pac = {
      x: M.PAC_START.x, y: M.PAC_START.y, px: M.PAC_START.x, py: M.PAC_START.y,
      dir: DIR.LEFT, facing: DIR.LEFT, want: DIR.LEFT, stall: 0, moving: false, travel: 0
    };
    this.ghosts = GHOSTS.map((g, i) => ({
      ...g, idx: i, scatter: [...g.scatter], px: g.x, py: g.y,
      frightened: false, exitRight: false, travel: 0
    }));
    this.modeIndex = 0;
    this.modeTimer = this.spec.modeFrames[0];
    this.frightTimer = 0;
    this.ghostsEatenInFright = 0;
    this.idleTimer = 0;
    this.fruit = null;
    this.popups = [];
    this.eaten = null;
  }

  setPhase(phase, frames = 0) {
    this.phase = phase;
    this.phaseTimer = frames;
  }

  get scattering() { return this.modeIndex % 2 === 0; }
  get frightActive() { return this.frightTimer > 0; }

  get elroy() {
    if (this.elroySuspended) return 0;
    if (this.dotsLeft <= this.spec.elroy2Dots) return 2;
    if (this.dotsLeft <= this.spec.elroy1Dots) return 1;
    return 0;
  }

  /* True during the closing blinks of fright, on the white half of the blink. */
  get frightFlashWhite() {
    if (!this.frightActive) return false;
    const flashFrames = this.spec.flashes * FLASH_FRAMES;
    if (this.frightTimer > flashFrames) return false;
    return Math.floor(this.frightTimer / (FLASH_FRAMES / 2)) % 2 === 1;
  }

  setInput(dir) { if (dir >= 0 && dir <= 3) this.pac.want = dir; }

  addScore(n) {
    const before = this.score;
    this.score += n;
    if (!this.extraLifeAwarded && before < EXTRA_LIFE_AT && this.score >= EXTRA_LIFE_AT) {
      this.extraLifeAwarded = true;
      this.lives++;
      this.emit('extraLife');
    }
  }

  /* ---------------------------------------------------------------- frame */

  step() {
    this.tick++;
    const actors = [this.pac, ...this.ghosts];
    for (const a of actors) { a.px = a.x; a.py = a.y; }
    for (const p of this.popups) p.frames--;
    this.popups = this.popups.filter((p) => p.frames > 0);

    switch (this.phase) {
      case 'ready':
        if (--this.phaseTimer <= 0) { this.setPhase('playing'); this.emit('go'); }
        break;
      case 'playing':
        this.stepPlaying();
        break;
      case 'ghostEaten':
        for (const g of this.ghosts) {
          if (g !== this.eaten.ghost && (g.state === 'eyes' || g.state === 'entering')) this.moveGhost(g);
        }
        if (--this.phaseTimer <= 0) { this.eaten = null; this.setPhase('playing'); }
        break;
      case 'dying':
        if (--this.phaseTimer <= 0) { this.setPhase('deathAnim', 110); this.emit('deathAnim'); }
        break;
      case 'deathAnim':
        if (--this.phaseTimer <= 0) {
          if (this.lives <= 0) { this.setPhase('gameover'); this.emit('gameOver', { score: this.score }); }
          else {
            this.lives--;
            this.resetActors();
            this.globalCounterOn = true;
            this.globalCounter = 0;
            this.elroySuspended = true;
            this.setPhase('ready', 120);
            this.emit('lifeStart');
          }
        }
        break;
      case 'levelDone':
        if (--this.phaseTimer <= 0) { this.setPhase('flash', 120); this.emit('mazeFlash'); }
        break;
      case 'flash':
        if (--this.phaseTimer <= 0) {
          if (INTERMISSION_AFTER.has(this.level)) {
            this.intermission = Math.min(2, [2, 5, 9, 13, 17].indexOf(this.level));
            this.setPhase('intermission', 330);
            this.emit('intermission', { which: this.intermission });
          } else this.nextLevel();
        }
        break;
      case 'intermission':
        if (--this.phaseTimer <= 0) this.nextLevel();
        break;
      default:
        break;
    }
  }

  nextLevel() {
    this.level++;
    this.startLevel(false);
  }

  stepPlaying() {
    const spec = this.spec;
    this.stats.frames++;

    if (this.frightTimer > 0) {
      if (--this.frightTimer === 0) {
        for (const g of this.ghosts) g.frightened = false;
        this.emit('frightEnd');
      }
    } else if (this.modeTimer !== Infinity && --this.modeTimer <= 0) {
      this.modeIndex++;
      this.modeTimer = spec.modeFrames[this.modeIndex] ?? Infinity;
      this.reverseGhosts();
    }

    if (this.fruit && --this.fruit.frames <= 0) this.fruit = null;
    if (this.elroySuspended && this.ghosts[3].state !== 'house') this.elroySuspended = false;
    this.updateHouse();

    if (this.pac.stall > 0) {
      this.pac.stall--;
      this.pac.moving = false;
    } else {
      this.movePac(this.frightActive ? spec.speed.pacF : spec.speed.pac);
      this.eatAtPac();
      if (this.dotsLeft === 0) {
        this.frightTimer = 0;
        for (const g of this.ghosts) g.frightened = false;
        this.setPhase('levelDone', 60);
        this.emit('levelClear', { level: this.level });
        return;
      }
    }
    if (this.checkCollisions()) return;

    for (const g of this.ghosts) this.moveGhost(g);
    this.checkCollisions();
  }

  reverseGhosts() {
    for (const g of this.ghosts) {
      if (g.state === 'active') g.dir = opposite(g.dir);
      else if (g.state === 'house' || g.state === 'leaving') g.exitRight = true;
    }
  }

  /* ----------------------------------------------------------------- pac */

  movePac(dist) {
    const p = this.pac;
    const tc = M.tileOf(p.x), tr = M.tileOf(p.y);
    const want = p.want;

    if (want >= 0 && want !== p.dir) {
      if (want === opposite(p.dir)) p.dir = want;
      else if (M.walkable(tc + DX[want], tr + DY[want])) p.dir = want;
    }

    const d = p.dir;
    const open = M.walkable(tc + DX[d], tr + DY[d]);
    const ox = p.x, oy = p.y;
    if (DX[d] !== 0) {
      const cx = M.centerOf(tc);
      let nx = p.x + DX[d] * dist;
      if (!open) nx = DX[d] > 0 ? Math.min(nx, Math.max(p.x, cx)) : Math.max(nx, Math.min(p.x, cx));
      p.x = nx;
      const cy = M.centerOf(tr);
      p.y += Math.sign(cy - p.y) * Math.min(dist, Math.abs(cy - p.y));
    } else {
      const cy = M.centerOf(tr);
      let ny = p.y + DY[d] * dist;
      if (!open) ny = DY[d] > 0 ? Math.min(ny, Math.max(p.y, cy)) : Math.max(ny, Math.min(p.y, cy));
      p.y = ny;
      const cx = M.centerOf(tc);
      p.x += Math.sign(cx - p.x) * Math.min(dist, Math.abs(cx - p.x));
    }
    this.wrap(p);
    const moved = Math.abs(p.x - ox) + Math.abs(p.y - oy);
    p.moving = moved > 1e-6;
    if (p.moving) { p.travel += moved; p.facing = d; }
  }

  eatAtPac() {
    const p = this.pac;
    const c = M.tileOf(p.x), r = M.tileOf(p.y);
    if (c >= 0 && c < M.COLS && r >= 0 && r < M.ROWS) {
      const i = r * M.COLS + c;
      const item = this.items[i];
      if (item) {
        this.items[i] = M.ITEM.NONE;
        this.dotsEaten++;
        this.dotsLeft--;
        this.stats.dots++;
        this.idleTimer = 0;
        this.countDotForHouse();
        if (item === M.ITEM.DOT) {
          this.addScore(10);
          p.stall = 1;
          this.emit('dot', { c, r });
        } else {
          this.addScore(50);
          p.stall = 3;
          this.emit('power', { c, r });
          this.startFright();
        }
        if (this.dotsEaten === 70 || this.dotsEaten === 170) {
          this.fruit = { ...this.spec.fruit, frames: Math.round(560 + this.rand() * 40) };
          this.emit('fruitShow');
        }
      }
    }
    const f = this.fruit;
    if (f && r === M.tileOf(M.FRUIT_POS.y) && Math.abs(p.x - M.FRUIT_POS.x) <= 6) {
      this.addScore(f.points);
      this.stats.fruit++;
      this.popups.push({ x: M.FRUIT_POS.x, y: M.FRUIT_POS.y, text: String(f.points), frames: 120, kind: 'fruit' });
      this.emit('fruit', { kind: f.kind, points: f.points, x: M.FRUIT_POS.x, y: M.FRUIT_POS.y });
      this.fruit = null;
    }
  }

  startFright() {
    this.ghostsEatenInFright = 0;
    this.reverseGhosts();
    const frames = this.spec.frightFrames;
    if (frames <= 0) return;
    this.frightTimer = frames;
    for (const g of this.ghosts) if (g.state !== 'eyes' && g.state !== 'entering') g.frightened = true;
    this.emit('frightStart');
  }

  /* --------------------------------------------------------------- house */

  countDotForHouse() {
    if (this.globalCounterOn) {
      this.globalCounter++;
      const [, pinky, inky, clyde] = this.ghosts;
      if (this.globalCounter === 7 && pinky.state === 'house') this.release(pinky);
      else if (this.globalCounter === 17 && inky.state === 'house') this.release(inky);
      else if (this.globalCounter === 32 && clyde.state === 'house') {
        this.release(clyde);
        this.globalCounterOn = false;
      }
      return;
    }
    const pref = this.preferredGhost();
    if (pref) this.houseCounters[pref.idx - 1]++;
  }

  preferredGhost() {
    for (let i = 1; i < 4; i++) if (this.ghosts[i].state === 'house') return this.ghosts[i];
    return null;
  }

  updateHouse() {
    const pref = this.preferredGhost();
    if (!pref) { this.idleTimer = 0; return; }
    if (!this.globalCounterOn && this.houseCounters[pref.idx - 1] >= this.spec.houseLimits[pref.idx - 1]) {
      this.release(pref);
      return;
    }
    if (++this.idleTimer >= this.spec.idleLimit) {
      this.idleTimer = 0;
      this.release(pref);
    }
  }

  release(g) {
    if (g.state === 'house') g.state = 'leaving';
  }

  /* -------------------------------------------------------------- ghosts */

  ghostSpeed(g) {
    const s = this.spec.speed;
    if (g.state === 'eyes' || g.state === 'entering') return EYES_SPEED;
    if (g.state === 'house' || g.state === 'leaving') return HOUSE_SPEED;
    if (inTunnel(M.tileOf(g.x), M.tileOf(g.y))) return s.tunnel;
    if (g.frightened) return s.ghostF;
    if (g.idx === 0) {
      const e = this.elroy;
      if (e === 2) return s.elroy2;
      if (e === 1) return s.elroy1;
    }
    return s.ghost;
  }

  moveGhost(g) {
    const dist = this.ghostSpeed(g);
    const ox = g.x, oy = g.y;
    switch (g.state) {
      case 'house': this.bob(g, dist); break;
      case 'leaving': this.leave(g, dist); break;
      case 'entering': this.enter(g, dist); break;
      default: this.moveOnGrid(g, dist);
    }
    g.travel += Math.abs(g.x - ox) + Math.abs(g.y - oy);
  }

  bob(g, dist) {
    if (g.dir !== DIR.UP && g.dir !== DIR.DOWN) g.dir = DIR.UP;
    g.y += DY[g.dir] * dist;
    if (g.y <= HOUSE_TOP) { g.y = HOUSE_TOP; g.dir = DIR.DOWN; }
    if (g.y >= HOUSE_BOTTOM) { g.y = HOUSE_BOTTOM; g.dir = DIR.UP; }
  }

  approach(g, axis, target, dist) {
    const v = g[axis];
    if (v === target) return dist;
    const delta = target - v;
    const stepLen = Math.min(dist, Math.abs(delta));
    g[axis] = v + Math.sign(delta) * stepLen;
    if (axis === 'x') g.dir = delta < 0 ? DIR.LEFT : DIR.RIGHT;
    else g.dir = delta < 0 ? DIR.UP : DIR.DOWN;
    return dist - stepLen;
  }

  leave(g, dist) {
    if (g.x !== M.HOUSE_DOOR_X && g.y !== M.HOUSE_CENTER_Y) dist = this.approach(g, 'y', M.HOUSE_CENTER_Y, dist);
    if (dist > 0) dist = this.approach(g, 'x', M.HOUSE_DOOR_X, dist);
    if (dist > 0) dist = this.approach(g, 'y', M.HOUSE_EXIT_Y, dist);
    if (g.y === M.HOUSE_EXIT_Y && g.x === M.HOUSE_DOOR_X) {
      g.state = 'active';
      g.dir = g.exitRight ? DIR.RIGHT : DIR.LEFT;
      g.exitRight = false;
    }
  }

  enter(g, dist) {
    if (g.y === M.HOUSE_EXIT_Y) dist = this.approach(g, 'x', M.HOUSE_DOOR_X, dist);
    if (dist > 0 && g.x === M.HOUSE_DOOR_X) dist = this.approach(g, 'y', M.HOUSE_CENTER_Y, dist);
    if (dist > 0 && g.y === M.HOUSE_CENTER_Y) dist = this.approach(g, 'x', g.home, dist);
    if (g.y === M.HOUSE_CENTER_Y && g.x === g.home) {
      g.state = 'leaving';
      g.frightened = false;
      this.emit('ghostHome', { ghost: g.name });
    }
  }

  moveOnGrid(g, dist) {
    for (let guard = 0; dist > 1e-9 && guard < 4; guard++) {
      const horiz = DX[g.dir] !== 0;
      const sign = horiz ? DX[g.dir] : DY[g.dir];
      const along = horiz ? g.x : g.y;
      const center = M.centerOf(M.tileOf(along));
      const toCenter = (center - along) * sign;
      if (toCenter > 1e-9 && toCenter <= dist) {
        if (horiz) g.x = center; else g.y = center;
        dist -= toCenter;
        this.arriveAtCenter(g);
        if (g.state !== 'active' && g.state !== 'eyes') {
          if (g.state === 'entering') this.enter(g, dist);
          return;
        }
      } else {
        if (horiz) g.x += sign * dist; else g.y += sign * dist;
        dist = 0;
      }
    }
    this.wrap(g);
  }

  arriveAtCenter(g) {
    const c = M.tileOf(g.x), r = M.tileOf(g.y);
    if (g.state === 'eyes' && r === 11 && (c === 13 || c === 14)) {
      g.state = 'entering';
      return;
    }
    const options = [];
    for (let d = 0; d < 4; d++) {
      if (d === opposite(g.dir)) continue;
      if (!M.walkable(c + DX[d], r + DY[d])) continue;
      if (d === DIR.UP && g.state === 'active' && !g.frightened && M.RED_ZONES.has(tileKey(c, r))) continue;
      options.push(d);
    }
    if (options.length === 0) { g.dir = opposite(g.dir); return; }
    if (g.frightened && g.state === 'active') {
      let d = Math.floor(this.rand() * 4);
      for (let k = 0; k < 4 && !options.includes(d); k++) d = (d + 1) % 4;
      g.dir = options.includes(d) ? d : options[0];
      return;
    }
    const [tx, ty] = this.targetFor(g);
    let best = options[0], bestD = Infinity;
    for (const d of options) {
      const nx = c + DX[d], ny = r + DY[d];
      const dd = (nx - tx) ** 2 + (ny - ty) ** 2;
      if (dd < bestD) { bestD = dd; best = d; }
    }
    g.dir = best;
  }

  targetFor(g) {
    if (g.state === 'eyes') return [13, 11];
    const p = this.pac;
    const pc = M.tileOf(p.x), pr = M.tileOf(p.y);
    const pd = p.facing;
    if (this.scattering && !(g.idx === 0 && this.elroy > 0)) return g.scatter;
    switch (g.idx) {
      case 0: return [pc, pr];
      case 1: {
        let tx = pc + DX[pd] * 4;
        const ty = pr + DY[pd] * 4;
        if (pd === DIR.UP) tx -= 4;
        return [tx, ty];
      }
      case 2: {
        let vx = pc + DX[pd] * 2;
        const vy = pr + DY[pd] * 2;
        if (pd === DIR.UP) vx -= 2;
        const b = this.ghosts[0];
        const bc = M.tileOf(b.x), br = M.tileOf(b.y);
        return [vx * 2 - bc, vy * 2 - br];
      }
      default: {
        const cc = M.tileOf(g.x), cr = M.tileOf(g.y);
        return (cc - pc) ** 2 + (cr - pr) ** 2 > 64 ? [pc, pr] : g.scatter;
      }
    }
  }

  wrap(a) {
    const lo = -M.TUNNEL_EXTRA * M.TILE;
    if (a.x < lo) { a.x += M.WRAP_SPAN; a.px = a.x; }
    else if (a.x >= lo + M.WRAP_SPAN) { a.x -= M.WRAP_SPAN; a.px = a.x; }
  }

  /* ---------------------------------------------------------- collisions */

  checkCollisions() {
    const p = this.pac;
    const pc = M.tileOf(p.x), pr = M.tileOf(p.y);
    for (const g of this.ghosts) {
      if (g.state !== 'active') continue;
      if (M.tileOf(g.x) !== pc || M.tileOf(g.y) !== pr) continue;
      if (g.frightened) {
        this.ghostsEatenInFright++;
        this.stats.ghosts++;
        this.stats.bestCombo = Math.max(this.stats.bestCombo, this.ghostsEatenInFright);
        const points = 200 * 2 ** (this.ghostsEatenInFright - 1);
        this.addScore(points);
        g.state = 'eyes';
        g.frightened = false;
        this.eaten = { ghost: g, points, x: g.x, y: g.y };
        this.setPhase('ghostEaten', 60);
        this.emit('ghostEaten', { ghost: g.name, points, x: g.x, y: g.y, n: this.ghostsEatenInFright });
        return true;
      }
      if (this.invincible) continue;
      this.fruit = null;
      this.frightTimer = 0;
      this.setPhase('dying', 60);
      this.emit('death');
      return true;
    }
    return false;
  }
}
