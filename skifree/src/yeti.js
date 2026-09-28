// The Abominable Snow Monster.
//
// It is a pursuer, not a boss: it predicts where you are going, steers around
// trees it can see coming, and is a little faster than you at cruising speed.
// It is slower than you on the F key, and trees it fails to dodge knock it
// flat for a moment. Those three facts are the whole escape game.
import { CONFIG } from './config.js';
import { OBJECTS } from './objects.js';
import { avoidance } from './actors.js';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

export const YETI_RADIUS = 12;

export class Yeti {
  // encounter: 0 for the first appearance, 1 for the second...
  constructor(player, world, rng, encounter, viewHalfWidth, cfg = CONFIG) {
    this.cfg = cfg;
    this.encounter = encounter;
    this.boost = Math.min(cfg.YETI_SPEED_STEP_MAX, encounter * cfg.YETI_SPEED_STEP);
    this.state = 'chase'; // chase | stumble | eat | giveup | gone
    this.timer = 0;
    this.anim = 0;
    this.escape = 0;
    this.eatTime = 0;
    this.lunging = false;

    // Where does it come from this time? Mostly from behind, sometimes from
    // the side, occasionally from ahead: the surprise is part of the joke.
    const roll = rng.next();
    const side = rng.sign();
    const offW = viewHalfWidth + 90;
    if (roll < 0.55) {
      this.approach = 'behind';
      this.x = player.x + rng.range(-220, 220);
      this.y = player.y - cfg.YETI_START_DISTANCE;
    } else if (roll < 0.85) {
      this.approach = 'side';
      this.x = player.x + side * offW;
      this.y = player.y - rng.range(80, 220);
    } else {
      this.approach = 'ahead';
      this.x = player.x + side * offW;
      this.y = player.y + rng.range(160, 320);
    }
    // Never appear inside a tree.
    for (let i = 0; i < 24 && !world.isFree(this.x, this.y, YETI_RADIUS + 4); i++) {
      this.x += rng.range(-40, 40);
      this.y -= 20;
    }
    this.heading = Math.atan2(player.x - this.x, player.y - this.y);
    this.speed = Math.max(player.speed * 0.9, cfg.YETI_SPEED * 0.5);
  }

  get topSpeed() {
    return this.cfg.YETI_SPEED * (1 + this.boost);
  }

  distanceTo(p) {
    return Math.hypot(p.x - this.x, p.y - this.y);
  }

  update(dt, game) {
    const { player, world, events } = game;
    const c = this.cfg;
    this.anim += dt;

    if (this.state === 'gone') return;

    if (this.state === 'eat') {
      this.eatTime += dt;
      this.speed = 0;
      // Settle exactly onto the victim.
      this.x += (player.x - this.x) * Math.min(1, dt * 10);
      this.y += (player.y - 4 - this.y) * Math.min(1, dt * 10);
      return;
    }

    if (this.state === 'giveup') {
      // Wanders off uphill, grumbling.
      this.timer -= dt;
      this.heading = wrap(this.heading + (Math.PI - this.heading) * Math.min(1, dt * 2));
      this.speed = Math.min(this.speed + 200 * dt, this.topSpeed * 0.8);
      this.move(dt);
      if (this.timer <= 0) this.state = 'gone';
      return;
    }

    if (this.state === 'stumble') {
      this.timer -= dt;
      this.speed = Math.max(0, this.speed - 900 * dt);
      this.move(dt);
      if (this.timer <= 0) this.state = 'chase';
      return;
    }

    // ---- chase
    const d = this.distanceTo(player);
    const pvx = Math.sin(player.travel) * player.speed;
    const pvy = Math.cos(player.travel) * player.speed;
    const lead = player.down ? 0 : Math.min(c.YETI_LEAD_TIME, d / Math.max(1, this.speed));
    const tx = player.x + pvx * lead;
    const ty = player.y + pvy * lead;
    let want = Math.atan2(tx - this.x, ty - this.y);

    const dx = Math.sin(this.heading), dy = Math.cos(this.heading);
    const reach = Math.min(d, 30 + this.speed * c.YETI_PROBE_TIME);
    const nudge = avoidance(world, this.x, this.y, dx, dy, reach, YETI_RADIUS + 2);
    if (nudge) want = this.heading + nudge * 1.2;

    const diff = clamp(wrap(want - this.heading), -c.YETI_TURN_RATE * dt, c.YETI_TURN_RATE * dt);
    this.heading = wrap(this.heading + diff);

    let top = this.topSpeed;
    if (d > c.YETI_CATCHUP_DISTANCE && !player.turbo) top *= 1 + c.YETI_CATCHUP_BONUS;
    this.lunging = d < 80 && !player.down;
    if (this.lunging) top *= 1.12;
    // Hard turns cost it pace, like everyone else.
    top *= 1 - 0.35 * Math.min(1, Math.abs(wrap(want - this.heading)));
    this.speed = this.speed < top ? Math.min(top, this.speed + c.YETI_ACCELERATION * dt) : Math.max(top, this.speed - c.YETI_ACCELERATION * dt);
    this.move(dt);

    // ---- terrain
    world.forEachNear(this.x, this.y, YETI_RADIUS, (o, dist) => {
      if (o.state || this.state !== 'chase') return;
      const def = OBJECTS[o.t];
      if (def.yeti === 'smash') {
        game.smashObject(o);
      } else if (def.yeti === 'stumble') {
        this.state = 'stumble';
        this.timer = c.YETI_STUMBLE_TIME;
        this.speed *= c.YETI_STUMBLE_SPEED_KEEP;
        if (dist > 0.01) {
          const push = def.r + YETI_RADIUS - dist + 1;
          this.x += ((this.x - o.x) / dist) * push;
          this.y += ((this.y - o.y) / dist) * push;
        }
        events.push({ type: 'yetibonk', x: this.x, y: this.y });
      }
    });

    // ---- bystanders get bowled over
    for (const a of game.actors) {
      if (a.fallen || a.hitCooldown > 0) continue;
      if (Math.abs(a.x - this.x) < 22 && Math.abs(a.y - this.y) < 22 && Math.hypot(a.x - this.x, a.y - this.y) < YETI_RADIUS + a.radius) {
        a.knockOver(events, game.rng);
        a.hitCooldown = 1.5;
      }
    }

    // ---- the grab
    if (player.state !== 'caught' && d < c.YETI_CATCH_RADIUS && player.z < c.YETI_REACH_HEIGHT) {
      this.state = 'eat';
      this.eatTime = 0;
      events.push({ type: 'caught', x: player.x, y: player.y });
      return;
    }

    // ---- losing the scent
    if (d > c.YETI_ESCAPE_DISTANCE) this.escape += dt;
    else this.escape = Math.max(0, this.escape - dt * 2);
    if (this.escape >= c.YETI_ESCAPE_TIME) {
      this.state = 'giveup';
      this.timer = 3;
      events.push({ type: 'escape', x: this.x, y: this.y });
    }
  }

  move(dt) {
    this.x += Math.sin(this.heading) * this.speed * dt;
    this.y += Math.cos(this.heading) * this.speed * dt;
  }
}
