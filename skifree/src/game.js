// One run down the mountain. Pure simulation: no DOM, no audio, no drawing.
// Everything the presentation layer needs to react to is pushed onto
// `events`, which the host drains once per frame.
import { CONFIG, METER } from './config.js';
import { OBJECTS } from './objects.js';
import { Rng, hash } from './rng.js';
import { World, courses } from './world.js';
import { Player } from './player.js';
import { spawnActors } from './actors.js';
import { Yeti } from './yeti.js';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const TRICK_NAMES = { flip: 'Backflip', eagle: 'Spread eagle', spin: 'Helicopter' };

export class Game {
  // opts: { seed, cfg, demo, viewW, viewH }
  //   demo = attract mode behind the title (no yeti)
  //   viewW/H = visible world size, so the first actors spawn off-screen
  constructor({ seed, cfg = CONFIG, demo = false, viewW = 900, viewH = 640 } = {}) {
    this.cfg = cfg;
    this.seed = seed >>> 0;
    this.demo = demo;
    this.rng = new Rng(hash(this.seed, 0x5eed));
    this.world = new World(this.seed, cfg);
    this.player = new Player(0, 0, cfg);
    this.actors = [];
    this.yeti = null;
    this.events = [];
    this.decals = [];
    this.time = 0;
    this.style = 0;
    this.over = false;
    this.overTime = 0;
    this.stats = {
      distance: 0, // metres of downhill progress (best y reached)
      maxSpeed: 0, // world units / s
      hits: 0,
      falls: 0,
      yetiEncounters: 0,
      yetiEscapes: 0,
      airTime: 0,
      gates: 0,
      tricks: 0,
    };
    this.nextYetiAt = cfg.YETI_TRIGGER_DISTANCE;
    // Stall watch: the yeti also comes for skiers who stop making progress.
    this.progressMark = 0;
    this.stallTime = 0;
    this.stallWarned = false;
    this.wanderTime = 0;
    // Timed course in progress: { def, time, missed, passed, style0 }.
    this.courses = courses(cfg);
    this.course = null;
    this.hopWasDown = true; // a key still held from the menu mustn't hop on frame one

    // Camera (centre of view, in world units) and the view size at zoom 1.
    this.viewW = viewW;
    this.viewH = viewH;
    this.zoomMul = 1;
    this.anchor = cfg.CAMERA_ANCHOR;
    this.camX = 0;
    this.camY = this.player.y + (0.5 - this.anchor) * this.viewH;
    this.shake = 0;
    this.refreshWorld();
  }

  get score() {
    return Math.floor(this.stats.distance) + Math.floor(this.style);
  }

  // The visible rect in world units, accounting for speed zoom.
  get view() {
    const w = this.viewW * this.zoomMul, h = this.viewH * this.zoomMul;
    return { x0: this.camX - w / 2, y0: this.camY - h / 2, x1: this.camX + w / 2, y1: this.camY + h / 2, w, h };
  }

  setViewSize(w, h) {
    this.viewW = w;
    this.viewH = h;
  }

  // ---------------------------------------------------------------- step

  update(dt, input) {
    if (this.over) {
      // Frozen run, but the yeti keeps celebrating behind the results.
      this.overTime += dt;
      if (this.yeti) this.yeti.update(dt, this);
      return;
    }
    this.time += dt;
    if (this.course) this.course.time += dt;
    const p = this.player;
    const prevY = p.y;
    const firstEvent = this.events.length;

    // Jump is edge-triggered so holding space doesn't bunny-hop forever.
    // In the air the same button spins.
    if (input.jump && !this.hopWasDown) {
      if (p.state === 'air') p.startTrick('spin', this.events);
      else p.hop(this.events);
    }
    this.hopWasDown = !!input.jump;

    p.update(dt, input, this.events);
    this.collidePlayer(prevY);

    for (const a of this.actors) {
      if (Math.abs(a.y - this.camY) < this.cfg.ACTOR_ACTIVE_RADIUS && Math.abs(a.x - this.camX) < this.cfg.ACTOR_ACTIVE_RADIUS) a.update(dt, this);
    }
    this.collideActors();

    this.updateYeti(dt);
    this.scoreEvents(firstEvent);
    this.updateStats(dt);
    this.updateCamera(dt);
    this.refreshWorld();
    for (const o of this.decals) o.age += dt;
  }

  updateStats(dt) {
    const p = this.player;
    const m = p.y / METER;
    if (m > this.stats.distance) this.stats.distance = m;
    if (p.state !== 'caught' && p.speed > this.stats.maxSpeed) this.stats.maxSpeed = p.speed;
    if (p.state === 'air') this.stats.airTime += dt;
  }

  // ------------------------------------------------------------ collisions

  collidePlayer(prevY) {
    const p = this.player;
    const c = this.cfg;
    if (p.state === 'caught') return;
    const ghost = p.grace > 0;
    let insideSolid = false;

    this.world.forEachNear(p.x, p.y, c.COLLISION_RADIUS, (o, d) => {
      const def = OBJECTS[o.t];
      if (o.state) return; // already smashed / knocked flat
      if (p.z > def.h) return; // sailed over it

      // Normal pointing from the obstacle to the skier.
      let nx = p.x - o.x, ny = p.y - o.y;
      const len = Math.hypot(nx, ny) || 1;
      nx /= len;
      ny /= len;
      const pushOut = () => {
        const push = def.r + c.COLLISION_RADIUS - d + 0.5;
        if (push > 0) {
          p.x += nx * push;
          p.y += ny * push;
        }
      };

      if (p.down) {
        // Sliding on your face: don't re-trigger, just don't pass through.
        if (def.solid && def.h > 12) pushOut();
        return;
      }
      if (ghost && def.hit !== 'ramp' && def.hit !== 'bounce') {
        if (def.solid) insideSolid = true;
        return;
      }
      // Knock the skier off to the side they hit, so they get up beside the
      // obstacle rather than straight above it.
      const side = Math.abs(nx) > 0.05 ? Math.sign(nx) : this.rng.sign();

      switch (def.hit) {
        case 'crash':
          this.events.push({ type: 'hit', obj: o.t, x: p.x, y: p.y, speed: p.speed });
          pushOut();
          p.knockDown('crash', side * 0.9 + nx * 0.3, ny * 0.35);
          this.stats.hits++;
          this.stats.falls++;
          break;
        case 'tumble':
          this.events.push({ type: 'hit', obj: o.t, x: p.x, y: p.y, speed: p.speed });
          p.knockDown('tumble', side * 0.6, ny * 0.3);
          this.stats.hits++;
          this.stats.falls++;
          break;
        case 'smash': {
          this.smashObject(o);
          this.stats.hits++;
          if (p.speed > c.PLAYER_SPEED * 0.8) {
            p.knockDown('tumble', 0, 0);
            this.stats.falls++;
          } else {
            p.speed *= 0.6;
          }
          break;
        }
        case 'knock':
          o.state = 1;
          o.timer = 0;
          o.fall = nx > 0 ? -1 : 1;
          p.speed *= 0.88;
          this.events.push({ type: 'flag', x: o.x, y: o.y });
          break;
        case 'bounce':
          if (p.state !== 'ski' || o.id === p.lastMogul) break;
          p.lastMogul = o.id;
          p.speed *= 1 - c.MOGUL_SPEED_LOSS;
          if (p.speed > c.MOGUL_WIPEOUT_SPEED && this.rng.chance(c.MOGUL_WIPEOUT_CHANCE)) {
            this.events.push({ type: 'hit', obj: 'mogul', x: p.x, y: p.y, speed: p.speed });
            p.knockDown('tumble', 0, 0);
            this.stats.falls++;
          } else {
            p.bounce(c.MOGUL_BOUNCE * (0.45 + 0.55 * Math.min(1.4, p.speed / c.PLAYER_SPEED)));
            p.heading += this.rng.range(-0.18, 0.18) * Math.min(1.5, p.speed / c.PLAYER_SPEED);
            this.events.push({ type: 'mogul', x: p.x, y: p.y, speed: p.speed });
          }
          break;
        case 'ramp':
          if (p.state === 'ski' && p.z <= 0) p.rampLaunch(this.events);
          break;
      }
    });

    // Still overlapping something after getting up: stay ghosted until clear,
    // so a skier who doesn't steer can never be trapped crashing into one tree.
    if (insideSolid) p.grace = Math.max(p.grace, 0.15);

    // Slalom gates: crossing the line between the flags scores. On a timed
    // course, crossing a gate's line outside its flags is a miss.
    if (p.y > prevY) {
      const run = this.course;
      const x0 = run ? Math.min(p.x, run.def.x) - run.def.half - 200 : p.x - 80;
      const x1 = run ? Math.max(p.x, run.def.x) + run.def.half + 200 : p.x + 80;
      this.world.forEachInRect(x0, prevY - 1, x1, p.y + 1, (o) => {
        if (o.t !== 'gate' || o.state) return;
        if (!(prevY < o.y && p.y >= o.y)) return;
        const onCourse = run && run.def.gates && Math.abs(o.x - run.def.x) < run.def.half + 60;
        if (Math.abs(p.x - o.x) < o.v / 2) {
          o.state = 1;
          this.stats.gates++;
          if (onCourse) run.passed++;
          this.awardStyle(c.STYLE_GATE, 'Gate', o.x, o.y);
          this.events.push({ type: 'gate', x: o.x, y: o.y });
        } else if (onCourse) {
          o.state = 2;
          run.missed++;
          this.events.push({ type: 'gatemiss', x: o.x, y: o.y, penalty: c.COURSE_MISS_PENALTY });
        }
      });
    }
    this.updateCourse(prevY);
  }

  // Timed runs down Slalom, Tree Slalom and Freestyle, like the original.
  updateCourse(prevY) {
    const p = this.player;
    const c = this.cfg;
    const run = this.course;
    if (!run) {
      for (const def of this.courses) {
        if (prevY < def.startY && p.y >= def.startY && Math.abs(p.x - def.x) < def.half) {
          this.course = { def, time: 0, missed: 0, passed: 0, style0: this.style };
          this.events.push({ type: 'coursestart', id: def.id, name: def.name, x: def.x, y: def.startY });
          break;
        }
      }
      return;
    }
    const def = run.def;
    if (prevY < def.endY && p.y >= def.endY) {
      const ok = Math.abs(p.x - def.x) < def.half + 4 * METER;
      this.course = null;
      if (!ok) {
        this.events.push({ type: 'courseabort', id: def.id, name: def.name, reason: 'Missed the finish' });
        return;
      }
      const penalty = run.missed * c.COURSE_MISS_PENALTY;
      this.events.push({
        type: 'course', id: def.id, name: def.name, x: p.x, y: p.y,
        time: run.time, missed: run.missed, passed: run.passed, total: run.time + penalty,
        style: Math.floor(this.style - run.style0),
      });
    } else if (Math.abs(p.x - def.x) > c.COURSE_LANE_HALF || p.y < def.startY - 10 * METER) {
      this.course = null;
      this.events.push({ type: 'courseabort', id: def.id, name: def.name, reason: 'Left the course' });
    }
  }

  collideActors() {
    const p = this.player;
    if (!p.controllable || p.grace > 0) return;
    for (const a of this.actors) {
      if (a.fallen || a.hitCooldown > 0 || a.gone) continue;
      const dx = a.x - p.x, dy = a.y - p.y;
      if (Math.abs(dx) > 24 || Math.abs(dy) > 24) continue;
      if (Math.hypot(dx, dy) > a.radius + this.cfg.COLLISION_RADIUS) continue;
      if (Math.abs(p.z - a.z) > 18) continue; // jumped clean over
      a.hitCooldown = 1;
      const len = Math.hypot(dx, dy) || 1;
      if (a.kind === 'dog') {
        this.events.push({ type: 'dog', x: a.x, y: a.y, speed: p.speed });
        a.knockOver(this.events, this.rng);
        p.knockDown('tumble', -dx / len * 0.4, -dy / len * 0.4);
      } else {
        this.events.push({ type: 'bump', x: a.x, y: a.y, speed: p.speed, kind: a.kind });
        a.knockOver(this.events, this.rng);
        a.speed = Math.max(a.speed, p.speed * 0.5);
        a.heading = p.travel + this.rng.range(-0.5, 0.5);
        p.knockDown(p.speed > this.cfg.PLAYER_SPEED * 0.7 ? 'crash' : 'tumble', -dx / len, -dy / len);
      }
      this.stats.hits++;
      this.stats.falls++;
      break;
    }
  }

  smashObject(o) {
    if (o.state) return;
    o.state = 1;
    o.timer = 0;
    this.events.push({ type: 'smash', obj: o.t, x: o.x, y: o.y });
  }

  addStyle(n) {
    this.style += n;
  }

  // Style with a label, so the renderer can pop a "+40 Backflip" in the world.
  awardStyle(n, label, x, y) {
    if (n <= 0) return;
    this.style += n;
    this.events.push({ type: 'style', amount: Math.round(n), label, x, y });
  }

  addDecal(kind, x, y) {
    this.decals.push({ kind, x, y, age: 0 });
    if (this.decals.length > 60) this.decals.shift();
  }

  // Scores air and escapes off this step's events (the array spans a whole
  // frame of sub-steps, so only look at what this step added).
  scoreEvents(from) {
    const c = this.cfg;
    for (let i = from; i < this.events.length; i++) {
      const e = this.events[i];
      // Only real air counts: hops and mogul bounces would be farmable.
      if (e.type === 'land' && e.ramp) {
        let n = e.air * c.STYLE_PER_AIR_SECOND + c.STYLE_RAMP_BONUS;
        const names = [];
        for (const t of e.tricks || []) {
          n += c.TRICKS[t].style;
          names.push(TRICK_NAMES[t]);
        }
        this.stats.tricks += (e.tricks || []).length;
        this.awardStyle(n, names.length ? names.join(' + ') : 'Big air', e.x, e.y);
      } else if (e.type === 'escape') {
        this.stats.yetiEscapes++;
        this.awardStyle(c.STYLE_ESCAPE, 'Escaped!', this.player.x, this.player.y);
      }
    }
  }

  // ------------------------------------------------------------------ yeti

  updateYeti(dt) {
    const p = this.player;
    const c = this.cfg;
    if (!this.yeti && !this.demo && p.state !== 'caught') {
      const reason = this.yetiReason(dt);
      if (reason) {
        this.yeti = new Yeti(p, this.world, this.rng, this.stats.yetiEncounters, (this.viewW * this.zoomMul) / 2, c);
        this.stats.yetiEncounters++;
        this.stallTime = 0;
        this.stallWarned = false;
        this.wanderTime = 0;
        this.events.push({ type: 'yeti', x: this.yeti.x, y: this.yeti.y, approach: this.yeti.approach, reason });
      }
    }
    const y = this.yeti;
    if (!y) return;
    y.update(dt, this);

    if (y.state === 'eat' && p.state !== 'caught') {
      p.state = 'caught';
      p.speed = 0;
      p.z = 0;
      p.turbo = false;
    }
    if (y.state === 'eat' && y.eatTime >= c.YETI_EAT_TIME) this.finish();
    if (y.state === 'gone') {
      this.yeti = null;
      this.nextYetiAt = this.stats.distance + c.YETI_RETURN_DISTANCE;
      this.progressMark = this.stats.distance;
      this.stallTime = 0;
    }
  }

  // Why the yeti should come now, or null. Distance is the classic trigger;
  // stalling and wandering off the side of the mountain summon it too.
  yetiReason(dt) {
    const c = this.cfg;
    const d = this.stats.distance;
    if (d >= this.nextYetiAt) return 'distance';
    if (d > this.progressMark + c.YETI_STALL_PROGRESS) {
      this.progressMark = d;
      this.stallTime = 0;
      this.stallWarned = false;
    } else {
      this.stallTime += dt;
    }
    if (this.stallTime >= c.YETI_STALL_WARN && !this.stallWarned) {
      this.stallWarned = true;
      this.events.push({ type: 'yetiwarn', reason: 'stall' });
    }
    if (this.stallTime >= c.YETI_STALL_TIME) return 'stall';
    this.wanderTime = Math.abs(this.player.x) > c.YETI_WANDER_X ? this.wanderTime + dt : 0;
    if (this.wanderTime > 3) return 'wander';
    return null;
  }

  // Skips the rest of the eating animation (any key once it has read).
  skipEating() {
    const y = this.yeti;
    if (y && y.state === 'eat' && y.eatTime >= this.cfg.YETI_EAT_SKIPPABLE_AFTER) this.finish();
  }

  finish() {
    if (this.over) return;
    this.over = true;
    this.overTime = 0;
    this.events.push({ type: 'gameover', score: this.score });
  }

  // ---------------------------------------------------------------- camera

  updateCamera(dt) {
    const p = this.player;
    const c = this.cfg;
    const fast = clamp((p.speed - c.PLAYER_SPEED * 0.6) / (c.TURBO_SPEED - c.PLAYER_SPEED * 0.6), 0, 1);
    const k = 1 - Math.exp(-c.CAMERA_SMOOTH * dt);
    const y = this.yeti;
    const eating = y && y.state === 'eat';
    const zoomTarget = eating ? c.CAMERA_EAT_ZOOM : 1 + c.CAMERA_ZOOM_OUT_FAST * fast;
    this.zoomMul += (zoomTarget - this.zoomMul) * k * (eating ? 0.35 : 0.5);
    this.anchor += (c.CAMERA_ANCHOR + (c.CAMERA_ANCHOR_FAST - c.CAMERA_ANCHOR) * fast - this.anchor) * k * 0.5;
    const h = this.viewH * this.zoomMul;
    const lookX = Math.sin(p.travel) * p.speed * 0.35;
    // During the meal the yeti is the star: frame it, centred.
    const tx = eating ? y.x : p.x + lookX;
    const ty = eating ? y.y - 40 : p.y + (0.5 - this.anchor) * h;
    this.camX += (tx - this.camX) * k;
    // Vertical follow is stiffer: the skier must never leave the screen.
    this.camY += (ty - this.camY) * Math.min(1, k * 2.5);
    this.shake = p.turbo && p.onGround ? fast : 0;
  }

  refreshWorld() {
    const v = this.view;
    const fresh = this.world.update(v.x0, v.y0, v.x1, v.y1);
    for (const chunk of fresh) {
      const rng = new Rng(hash(this.seed, chunk.cx, chunk.cy, 31));
      for (const a of spawnActors(chunk, this.world, rng, v, this.cfg)) this.actors.push(a);
    }
    // Forget actors far behind (or far off to the side).
    const E = this.cfg.ACTOR_DESPAWN_BEHIND;
    let n = 0;
    for (const a of this.actors) {
      const keep = a.y > v.y0 - E && a.y < v.y1 + E * 3 && Math.abs(a.x - this.camX) < this.cfg.ACTOR_ACTIVE_RADIUS * 1.5;
      if (keep) this.actors[n++] = a;
      else a.gone = true;
    }
    this.actors.length = n;
  }
}
