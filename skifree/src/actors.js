// Everyone else on the mountain: skiers, snowboarders and dogs. Their brains
// are deliberately tiny: a wobble, a look-ahead probe for trees, and for dogs
// a taste for sprinting across the player's line. The chaos is emergent.
import { CONFIG } from './config.js';
import { OBJECTS } from './objects.js';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

function approach(a, b, step) {
  const d = b - a;
  return Math.abs(d) <= step ? b : a + Math.sign(d) * step;
}

// Returns a steering nudge (-1..1) away from the first solid object found
// ahead along (dirX, dirY), or 0 when the path is clear.
export function avoidance(world, x, y, dirX, dirY, reach, radius) {
  let best = null;
  let bestT = Infinity;
  const px = x + dirX * reach * 0.5;
  const py = y + dirY * reach * 0.5;
  world.forEachNear(px, py, reach * 0.5 + radius, (o) => {
    const def = OBJECTS[o.t];
    if (!def.solid || o.state) return;
    const rx = o.x - x, ry = o.y - y;
    const t = rx * dirX + ry * dirY; // distance along the path
    if (t < 0 || t > reach) return;
    const side = rx * dirY - ry * dirX; // signed distance off the path
    if (Math.abs(side) > def.r + radius) return;
    if (t < bestT) {
      bestT = t;
      best = side;
    }
  });
  if (best === null) return 0;
  // Obstacle to the right of the path (side > 0 in these coords) -> steer left.
  const urgency = 1 - bestT / reach;
  return (best > 0 ? -1 : 1) * (0.5 + urgency);
}

let nextActorId = 1;

export class Actor {
  constructor(kind, x, y, rng, cfg = CONFIG) {
    this.id = nextActorId++;
    this.kind = kind; // skier | boarder | dog
    this.cfg = cfg;
    this.x = x;
    this.y = y;
    this.z = 0;
    this.vz = 0;
    this.heading = rng.range(-0.3, 0.3);
    this.speed = 0;
    this.state = 'go'; // go | fall | air | sit | dash | flee | follow | chomped
    this.timer = 0;
    this.anim = rng.range(0, 10);
    this.phase = rng.range(0, Math.PI * 2);
    this.look = rng.int(0, 5); // palette variant
    this.owner = null;
    this.bold = rng.next(); // dogs: appetite for chaos
    this.cooldown = rng.range(1, 4);
    this.hitCooldown = 0;
    this.gone = false;

    if (kind === 'skier') {
      this.beginner = rng.chance(0.3);
      this.baseSpeed = this.beginner
        ? cfg.NPC_SKIER_SPEED_MIN * 0.7
        : rng.range(cfg.NPC_SKIER_SPEED_MIN, cfg.NPC_SKIER_SPEED_MAX);
      this.wobbleAmp = this.beginner ? 0.9 : rng.range(0.35, 0.65);
      this.wobbleFreq = this.beginner ? rng.range(0.6, 1) : rng.range(0.9, 1.6);
    } else if (kind === 'boarder') {
      this.baseSpeed = rng.range(cfg.SNOWBOARDER_SPEED_MIN, cfg.SNOWBOARDER_SPEED_MAX);
      this.wobbleAmp = rng.range(0.7, 1.05);
      this.wobbleFreq = rng.range(0.55, 0.85);
    } else if (kind === 'bear') {
      this.baseSpeed = cfg.BEAR_SPEED;
      this.crossDir = rng.sign();
      this.heading = this.crossDir * 1.3;
      this.timer = rng.range(3, 8);
      this.look = 0;
    } else {
      this.baseSpeed = cfg.DOG_SPEED * rng.range(0.85, 1.15);
      this.state = rng.chance(0.4) ? 'sit' : 'go';
      this.timer = rng.range(0.5, 3);
      this.heading = rng.range(-Math.PI, Math.PI);
    }
    this.speed = kind === 'dog' ? 0 : this.baseSpeed * 0.6;
  }

  get radius() {
    return this.kind === 'dog' ? 7 : this.kind === 'bear' ? this.cfg.BEAR_RADIUS : 6;
  }
  get fallen() {
    return this.state === 'fall' || this.state === 'chomped';
  }

  knockOver(events, rng) {
    // Bears don't fall over; they just look offended.
    if (this.kind === 'bear') {
      this.state = 'startled';
      this.timer = 1.2;
      this.speed = 0;
      events.push({ type: 'bear', x: this.x, y: this.y });
      return;
    }
    if (this.kind === 'dog') {
      this.state = 'flee';
      this.timer = 1.2;
      this.heading += Math.PI * rng.range(0.6, 1.4);
      this.speed = this.baseSpeed;
      events.push({ type: 'yelp', x: this.x, y: this.y });
      return;
    }
    if (this.state === 'fall') return;
    this.state = 'fall';
    this.timer = this.cfg.NPC_FALL_TIME;
    this.z = 0;
    events.push({ type: 'npcfall', x: this.x, y: this.y, kind: this.kind });
  }

  update(dt, game) {
    this.anim += dt;
    if (this.hitCooldown > 0) this.hitCooldown -= dt;
    if (this.state === 'chomped') return; // inside a yeti
    if (this.kind === 'dog') this.updateDog(dt, game);
    else if (this.kind === 'bear') this.updateBear(dt, game);
    else this.updateRider(dt, game);
  }

  // Polar bears amble across the slope, sometimes stopping to look around.
  updateBear(dt, game) {
    const c = this.cfg;
    this.timer -= dt;
    if (this.state === 'startled' || this.state === 'sit') {
      this.speed = 0;
      if (this.timer <= 0) {
        this.state = 'go';
        this.timer = game.rng.range(4, 9);
      }
      return;
    }
    if (this.timer <= 0) {
      this.state = 'sit';
      this.timer = game.rng.range(1.5, 4);
      return;
    }
    // Mostly across the hill, drifting a little downhill.
    const want = this.crossDir * (Math.PI / 2 - 0.25);
    const nudge = avoidance(game.world, this.x, this.y, Math.sin(this.heading), Math.cos(this.heading), 60, this.radius);
    this.heading = approach(this.heading, nudge ? this.heading + nudge : want, 1.5 * dt);
    this.speed = approach(this.speed, c.BEAR_SPEED, 60 * dt);
    this.moveBy(dt);
  }

  updateRider(dt, game) {
    const { world, events } = game;
    const c = this.cfg;
    if (this.state === 'fall') {
      this.speed = Math.max(0, this.speed - 400 * dt);
      this.timer -= dt;
      this.moveBy(dt);
      if (this.timer <= 0) {
        this.state = 'go';
        this.heading = game.rng.range(-0.4, 0.4);
      }
      return;
    }
    if (this.state === 'air') {
      this.vz -= c.GRAVITY_AIR * dt;
      this.z += this.vz * dt;
      if (this.z <= 0) {
        this.z = 0;
        this.state = 'go';
      }
      this.moveBy(dt);
      return;
    }

    // Modern mode: dog poop is slippery for everyone.
    if (game.modern && game.poopAt(this.x, this.y, this.radius) && game.rng.chance(0.6)) {
      this.knockOver(events, game.rng);
      events.push({ type: 'poop', x: this.x, y: this.y, npc: true });
      return;
    }

    // Seeing the yeti: some skiers bolt away from it, flat out.
    const y = game.yeti;
    if (game.modern && y && (y.state === 'chase' || y.state === 'stumble')) {
      if (this.aware === undefined && Math.hypot(y.x - this.x, y.y - this.y) < c.NPC_PANIC_RADIUS) {
        this.aware = game.rng.chance(c.NPC_PANIC_AWARE);
        if (this.aware) events.push({ type: 'panic', x: this.x, y: this.y });
      }
    } else {
      this.aware = undefined;
    }
    const panicking = this.aware && y;

    // Wobble (slalom / board carving) plus tree avoidance.
    this.phase += this.wobbleFreq * dt * Math.PI;
    let target = Math.sin(this.phase) * this.wobbleAmp;
    if (panicking) target = clamp(Math.atan2(this.x - y.x, Math.max(40, this.y - y.y)), -1.2, 1.2);
    const dx = Math.sin(this.heading), dy = Math.cos(this.heading);
    const reach = 40 + this.speed * 0.55;
    const nudge = avoidance(world, this.x, this.y, dx, dy, reach, this.radius + 4);
    if (nudge) target = clamp(this.heading + nudge * 1.1, -1.35, 1.35);
    this.heading = approach(this.heading, target, (nudge ? 4.5 : 2.2) * dt);

    const want = this.baseSpeed * (panicking ? 1.5 : 1) * Math.pow(Math.max(0.2, Math.cos(this.heading)), 0.5);
    this.speed = approach(this.speed, want, 160 * dt);
    this.moveBy(dt);

    // Terrain.
    world.forEachNear(this.x, this.y, this.radius, (o, d) => {
      const def = OBJECTS[o.t];
      if (o.state || this.state !== 'go') return;
      if (def.hit === 'ramp' && this.kind === 'boarder') {
        this.state = 'air';
        this.vz = c.RAMP_VELOCITY_MIN + this.speed * 0.8;
        this.z = 0.01;
      } else if (def.solid) {
        if (o.t === 'snowman') {
          game.smashObject(o);
          return;
        }
        // Never end up inside a tree, or the next frame hits it again.
        if (d > 0.01) {
          const push = def.r + this.radius - d + 1;
          this.x += ((this.x - o.x) / d) * push;
          this.y += ((this.y - o.y) / d) * push;
        }
        if (def.h > 20 || this.beginner) this.knockOver(events, game.rng);
      }
    });
    // Beginners occasionally just fall over on their own.
    if (this.beginner && game.rng.chance(dt * 0.05)) this.knockOver(events, game.rng);
  }

  updateDog(dt, game) {
    const { world, player, events, rng } = game;
    const c = this.cfg;
    this.timer -= dt;
    this.cooldown -= dt;

    // Owner still around?
    if (this.owner && (this.owner.gone || Math.hypot(this.owner.x - this.x, this.owner.y - this.y) > 900)) this.owner = null;

    // A bold dog near the player's line goes for the crossing.
    if ((this.state === 'go' || this.state === 'sit' || this.state === 'follow') && this.cooldown <= 0 && player.controllable) {
      const ahead = this.y - player.y;
      const lateral = Math.abs(this.x - player.x);
      if (ahead > 80 && ahead < 380 && lateral < 260 && this.bold > 0.35 && player.speed > 90) {
        // Aim for a point on the far side of where the player will be.
        const t = ahead / Math.max(60, player.speed);
        const px = player.x + Math.sin(player.travel) * player.speed * t;
        const side = this.x < px ? 1 : -1;
        this.dashX = px + side * rng.range(90, 160);
        this.dashY = this.y + rng.range(10, 50);
        this.state = 'dash';
        this.timer = 2.2;
        this.cooldown = rng.range(6, 12);
        if (rng.chance(0.7)) events.push({ type: 'woof', x: this.x, y: this.y });
      }
    }

    let tx = null, ty = null, pace = 0;
    switch (this.state) {
      case 'sit':
        this.speed = 0;
        if (this.timer <= 0) {
          this.state = this.owner ? 'follow' : 'go';
          this.timer = rng.range(1.5, 4);
          this.heading = rng.range(-Math.PI, Math.PI);
        }
        break;
      case 'go':
        pace = c.DOG_TROT_SPEED;
        tx = this.x + Math.sin(this.heading) * 50;
        ty = this.y + Math.cos(this.heading) * 50;
        if (this.owner) this.state = 'follow';
        else if (this.timer <= 0) {
          this.state = 'sit';
          this.timer = rng.range(1, 3.5);
          // Sitting by a tree leaves a souvenir.
          let tree = null;
          world.forEachNear(this.x, this.y, 30, (o) => {
            if (o.t.startsWith('tree')) tree = o;
          });
          if (tree && rng.chance(0.5)) game.addDecal('yellow', this.x, this.y + 4);
          else if (game.modern && rng.chance(c.DOG_POOP_CHANCE)) game.addPoop(this.x - Math.sin(this.heading) * 9, this.y + 3);
        }
        break;
      case 'follow': {
        const o = this.owner;
        if (!o) {
          this.state = 'go';
          break;
        }
        tx = o.x + Math.sin(this.phase) * 26;
        ty = o.y - 26;
        const d = Math.hypot(tx - this.x, ty - this.y);
        pace = d > 60 ? this.baseSpeed : Math.max(o.speed, c.DOG_TROT_SPEED);
        this.phase += dt * 1.3;
        break;
      }
      case 'dash':
        tx = this.dashX;
        ty = this.dashY;
        pace = this.baseSpeed * 1.15;
        if (this.timer <= 0 || Math.hypot(tx - this.x, ty - this.y) < 14) {
          this.state = 'sit';
          this.timer = rng.range(0.8, 2);
        }
        break;
      case 'flee':
        pace = this.baseSpeed;
        tx = this.x + Math.sin(this.heading) * 50;
        ty = this.y + Math.cos(this.heading) * 50;
        if (this.timer <= 0) {
          this.state = 'go';
          this.timer = rng.range(1, 3);
        }
        break;
      case 'chomped':
        return;
    }

    if (tx !== null) {
      const want = Math.atan2(tx - this.x, ty - this.y);
      let diff = want - this.heading;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      this.heading += clamp(diff, -8 * dt, 8 * dt);
      const dx = Math.sin(this.heading), dy = Math.cos(this.heading);
      const nudge = avoidance(world, this.x, this.y, dx, dy, 34 + pace * 0.3, this.radius + 2);
      if (nudge) this.heading += nudge * 6 * dt;
      this.speed = approach(this.speed, pace, 700 * dt);
    }
    this.moveBy(dt);

    // Dogs don't crash into trees; they bounce off them.
    world.forEachNear(this.x, this.y, this.radius, (o, d) => {
      const def = OBJECTS[o.t];
      if (!def.solid || o.state) return;
      const push = def.r + this.radius - d;
      if (d > 0.01) {
        this.x += ((this.x - o.x) / d) * push;
        this.y += ((this.y - o.y) / d) * push;
      }
    });
  }

  moveBy(dt) {
    this.x += Math.sin(this.heading) * this.speed * dt;
    this.y += Math.cos(this.heading) * this.speed * dt;
  }
}

// Populates a freshly generated chunk. `forbid` is the rect currently on
// screen: nothing ever materialises where the player can see it.
export function spawnActors(chunk, world, rng, forbid, cfg = CONFIG, modern = true) {
  const S = cfg.CHUNK_SIZE;
  const x0 = chunk.cx * S, y0 = chunk.cy * S;
  const out = [];
  if (Math.abs(x0 + S / 2) > cfg.WORLD_SIZE / 2) return out;
  if (y0 + S < 0) return out;
  const depth = world.depthFactor(y0);
  const place = (r) => {
    for (let tries = 0; tries < 8; tries++) {
      const x = x0 + rng.range(20, S - 20);
      const y = y0 + rng.range(20, S - 20);
      if (forbid && x > forbid.x0 && x < forbid.x1 && y > forbid.y0 && y < forbid.y1) continue;
      if (world.inStart(x, y)) continue;
      if (world.isFree(x, y, r + 12)) return { x, y };
    }
    return null;
  };

  let riders = 0;
  let p = cfg.ACTORS_PER_CHUNK * depth * (world.inCourses(x0 + S / 2, y0 + S / 2) ? 2 : 1);
  while (rng.chance(p) && riders < 3) {
    const at = place(8);
    if (!at) break;
    const kind = rng.chance(0.3) ? 'boarder' : 'skier';
    const a = new Actor(kind, at.x, at.y, rng, cfg);
    out.push(a);
    riders++;
    // Some skiers bring the dog.
    if (kind === 'skier' && rng.chance(0.3)) {
      const d = new Actor('dog', at.x + 20, at.y - 20, rng, cfg);
      d.owner = a;
      d.state = 'follow';
      out.push(d);
    }
    p *= 0.5;
  }
  if (rng.chance(cfg.DOGS_PER_CHUNK * (0.6 + depth * 0.6))) {
    const at = place(8);
    if (at) out.push(new Actor('dog', at.x, at.y, rng, cfg));
  }
  // Rare polar bears (modern mode only, and never in the first stretch).
  if (modern && y0 > 400 * 16 && rng.chance(cfg.BEARS_PER_CHUNK * depth)) {
    const at = place(cfg.BEAR_RADIUS);
    if (at) out.push(new Actor('bear', at.x, at.y, rng, cfg));
  }
  return out;
}
