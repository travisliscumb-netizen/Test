// The skier. Arcade physics with two angles:
//   heading  - where the skis point (what the player steers)
//   travel   - where the skier is actually moving
// Travel chases heading at a grip rate that falls with speed, and any angle
// between them scrubs speed. That lag is the whole "snow is slippery" feel:
// easy carving at low speed, big sliding arcs at turbo.
import { CONFIG } from './config.js';

const HALF_PI = Math.PI / 2;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

// Moves angle a toward b by at most step.
function approachAngle(a, b, step) {
  const d = b - a;
  if (Math.abs(d) <= step) return b;
  return a + Math.sign(d) * step;
}

export class Player {
  constructor(x = 0, y = 0, cfg = CONFIG) {
    this.cfg = cfg;
    this.x = x;
    this.y = y;
    this.z = 0; // height above the snow
    this.vz = 0;
    this.heading = 0;
    this.travel = 0;
    this.speed = cfg.PLAYER_START_PUSH;
    this.knockX = 0; // decaying shove from impacts
    this.knockY = 0;
    this.state = 'ski'; // ski | air | crash | tumble | recover | caught
    this.stateTime = 0; // seconds remaining in timed states
    this.grace = 0; // seconds of obstacle immunity after getting up
    this.hopCooldown = 0;
    this.turbo = false;
    this.braking = false;
    this.tucking = false;
    this.walking = 0; // -1 / 0 / 1 sidestep direction
    this.airTime = 0;
    this.airFromRamp = false;
    this.skid = 0; // 0..1 how sideways the skis are to travel (drives spray + sound)
    this.lastMogul = 0; // id of the mogul last bounced off, so one bump = one bounce
    this.trick = null; // { kind, t, dur } while one is in progress
    this.tricks = []; // tricks completed during the current jump
    this.prevUp = false; // edge detection: a key held from the ground isn't a trick
    this.prevDown = false;
    this.anim = 0; // free-running animation clock
  }

  get onGround() {
    return this.z <= 0 && this.state !== 'air';
  }
  get controllable() {
    return this.state === 'ski' || this.state === 'air';
  }
  get down() {
    return this.state === 'crash' || this.state === 'tumble' || this.state === 'recover';
  }

  hop(events) {
    if (this.state !== 'ski' || this.hopCooldown > 0) return false;
    this.launch(this.cfg.HOP_VELOCITY, false);
    events.push({ type: 'jump', x: this.x, y: this.y, speed: this.speed });
    return true;
  }

  // Ramps scale with speed: take them fast for real air.
  rampLaunch(events) {
    if (this.state !== 'ski') return false;
    const c = this.cfg;
    this.launch(c.RAMP_VELOCITY_MIN + this.speed * c.RAMP_VELOCITY_PER_SPEED, true);
    this.travel = this.heading = approachAngle(this.heading, 0, 0.35); // ramps kick you downhill a touch
    events.push({ type: 'ramp', x: this.x, y: this.y, speed: this.speed });
    return true;
  }

  bounce(v) {
    if (this.state !== 'ski') return;
    this.launch(v, false);
  }

  launch(vz, fromRamp) {
    this.state = 'air';
    this.vz = vz;
    this.z = Math.max(this.z, 0.01);
    this.airTime = 0;
    this.airFromRamp = fromRamp;
    this.trick = null;
    this.tricks = [];
  }

  // Air tricks, as in the original: flip, spread eagle, spin. One at a time.
  // Only off a ramp: hops and mogul bumps are too short to land anything, so
  // allowing them would turn a stray tap of Up/Down into a certain wipeout.
  startTrick(kind, events) {
    if (this.state !== 'air' || this.trick || !this.airFromRamp) return false;
    this.trick = { kind, t: 0, dur: this.cfg.TRICKS[kind].dur };
    events.push({ type: 'trick', kind, x: this.x, y: this.y });
    return true;
  }

  // kind: 'crash' (flat on your face) or 'tumble' (rolls and keeps sliding).
  // (nx, ny) is the direction to be shoved, usually away from the obstacle.
  knockDown(kind, nx = 0, ny = 0) {
    const c = this.cfg;
    if (this.state === 'caught') return;
    const impact = this.speed;
    if (kind === 'crash') {
      this.state = 'crash';
      this.stateTime = clamp(c.CRASH_TIME_BASE + impact * c.CRASH_TIME_PER_SPEED, c.CRASH_TIME_BASE, c.CRASH_TIME_MAX);
      this.speed *= c.CRASH_SPEED_KEEP;
      const push = c.CRASH_KNOCKBACK * (0.5 + Math.min(1, impact / c.PLAYER_SPEED));
      this.knockX = nx * push;
      this.knockY = ny * push;
    } else {
      this.state = 'tumble';
      this.stateTime = c.TUMBLE_TIME + Math.min(0.35, impact * 0.0009);
      this.speed *= c.TUMBLE_SPEED_KEEP;
      this.knockX = nx * c.CRASH_KNOCKBACK * 0.4;
      this.knockY = ny * c.CRASH_KNOCKBACK * 0.4;
    }
    this.z = 0;
    this.vz = 0;
    this.turbo = false;
    this.trick = null;
  }

  update(dt, input, events) {
    const c = this.cfg;
    this.anim += dt;
    if (this.hopCooldown > 0) this.hopCooldown -= dt;
    if (this.grace > 0) this.grace -= dt;
    this.walking = 0;

    // Impact shove decays independently of skiing.
    const kd = Math.exp(-5 * dt);
    this.knockX *= kd;
    this.knockY *= kd;

    switch (this.state) {
      case 'caught':
        return;
      case 'crash':
      case 'tumble': {
        this.stateTime -= dt;
        const fr = this.state === 'crash' ? c.PLAYER_FRICTION * 2.5 : c.PLAYER_FRICTION * 1.2;
        this.speed = Math.max(0, this.speed - fr * dt);
        this.move(dt);
        if (this.stateTime <= 0) {
          this.state = 'recover';
          this.stateTime = c.RECOVER_TIME;
        }
        this.skid = 0;
        return;
      }
      case 'recover': {
        this.stateTime -= dt;
        this.speed = Math.max(0, this.speed - c.PLAYER_FRICTION * 2 * dt);
        this.move(dt);
        if (this.stateTime <= 0) {
          this.state = 'ski';
          this.heading = this.travel = 0; // back on your feet pointing downhill, as ever
          this.grace = c.GRACE_TIME;
          this.speed = Math.max(this.speed, c.PLAYER_START_PUSH * 0.5);
        }
        return;
      }
    }

    const air = this.state === 'air';
    this.turbo = !!input.turbo;
    this.braking = !air && !!input.down && !this.turbo;
    this.tucking = !!input.up && !input.left && !input.right;

    // ---- steering
    let rate = Math.max(c.PLAYER_MIN_TURN_RATE, c.PLAYER_TURN_RATE / (1 + (this.speed / c.PLAYER_TURN_SPEED_REF) ** 2));
    if (this.turbo) rate *= c.TURBO_TURN_MULT;
    if (air) rate *= c.AIR_TURN_MULT;
    const steer = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    if (input.aim != null && steer === 0) {
      this.heading = approachAngle(this.heading, input.aim, rate * dt);
    } else if (steer !== 0) {
      // Already across the hill and still pushing that way: sidestep.
      if (!air && Math.abs(this.heading) >= HALF_PI - 1e-3 && Math.sign(this.heading) === steer && this.speed < 40) {
        this.walking = steer;
      }
      this.heading += steer * rate * dt;
    } else if (this.tucking) {
      this.heading = approachAngle(this.heading, 0, c.PLAYER_TUCK_TURN_RATE * dt);
    }
    this.heading = clamp(this.heading, -HALF_PI, HALF_PI);

    // Up / Down pressed (not held) in the air start a trick.
    const upEdge = !!input.up && !this.prevUp;
    const downEdge = !!input.down && !this.prevDown;
    this.prevUp = !!input.up;
    this.prevDown = !!input.down;
    if (air) {
      if (upEdge) this.startTrick('flip', events);
      else if (downEdge) this.startTrick('eagle', events);
      if (this.trick) {
        this.trick.t += dt;
        if (this.trick.t >= this.trick.dur) {
          this.tricks.push(this.trick.kind);
          this.trick = null;
        }
      }
    }

    if (air) {
      this.airTime += dt;
      this.vz -= c.GRAVITY_AIR * dt;
      this.z += this.vz * dt;
      // A little air control over the line, none over speed.
      this.travel = approachAngle(this.travel, this.heading, 0.5 * dt);
      if (this.z <= 0) this.land(events);
    } else {
      // ---- speed
      const across = Math.abs(this.heading) >= c.PLAYER_STOP_ANGLE;
      const fall = Math.cos(this.heading); // 1 straight down, 0 across
      const top = this.turbo ? c.TURBO_SPEED : c.PLAYER_SPEED;
      const target = across ? 0 : top * Math.pow(fall, 0.7);
      let accel = this.turbo ? c.TURBO_ACCELERATION : c.PLAYER_ACCELERATION;
      if (this.tucking) accel += c.PLAYER_TUCK_ACCEL;
      if (this.braking) {
        this.speed = Math.max(0, this.speed - c.PLAYER_BRAKE_DECEL * dt);
      } else if (this.speed < target) {
        this.speed = Math.min(target, this.speed + accel * Math.max(0.25, fall) * dt);
      } else {
        this.speed = Math.max(target, this.speed - c.PLAYER_FRICTION * dt);
      }

      // ---- carving: travel chases the skis; the difference is a skid
      let grip = c.PLAYER_GRIP / (1 + this.speed / c.PLAYER_GRIP_SPEED_REF);
      if (this.turbo) grip *= c.TURBO_GRIP_MULT;
      if (this.speed < 30) grip = 30; // nothing to slide on when nearly stopped
      this.travel = approachAngle(this.travel, this.heading, grip * dt);
      const slip = Math.abs(Math.sin(this.heading - this.travel));
      this.speed = Math.max(0, this.speed - c.PLAYER_SKID_DECEL * slip * dt);
      this.skid = Math.min(1, slip * 2.2 + (this.braking ? 0.6 : 0));
    }

    this.move(dt);
    if (this.walking) this.x += this.walking * c.PLAYER_WALK_SPEED * dt;
  }

  land(events) {
    const c = this.cfg;
    this.z = 0;
    this.vz = 0;
    this.state = 'ski';
    this.hopCooldown = c.HOP_COOLDOWN;
    const twist = Math.abs(this.heading - this.travel);
    const air = this.airTime;
    // Skis across the line of flight, or still upside down: wipeout.
    if (twist > c.LAND_SAFE_ANGLE || this.trick) {
      events.push({ type: 'wipeout', x: this.x, y: this.y, speed: this.speed, air, trick: this.trick?.kind });
      this.knockDown('crash', Math.sin(this.travel), Math.cos(this.travel));
      this.tricks = [];
      return;
    }
    this.heading = this.travel = (this.heading + this.travel) / 2;
    events.push({ type: 'land', x: this.x, y: this.y, speed: this.speed, air, ramp: this.airFromRamp, tricks: this.tricks.slice() });
    this.tricks = [];
  }

  move(dt) {
    this.x += (Math.sin(this.travel) * this.speed + this.knockX) * dt;
    this.y += (Math.cos(this.travel) * this.speed + this.knockY) * dt;
  }
}
