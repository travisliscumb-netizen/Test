/* Fight simulation. Fixed 60 Hz, deterministic for a given seed and input
   stream, no DOM. main.js feeds it inputs and draws it; the balance tests
   run it headless at thousands of ticks per second.                     */

import {
  FIGHTERS, MOVES, STAGE_W, WALL, GRAVITY, BUFFER, ROUND_TIME, ROUNDS_TO_WIN, HZ, clamp
} from './config.js';
import { POSES, track, lerpPose, solve, scaledBody, groundOffset, restingHip } from './skeleton.js';

export function rng32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const blankInput = () => ({
  held: { l: false, r: false, u: false, d: false, p: false, k: false, b: false, s: false },
  pressed: { p: false, k: false, s: false, u: false }
});

const NEUTRAL = new Set(['idle', 'walk', 'crouch', 'block', 'cblock']);
const AIRBORNE = new Set(['jump', 'air']);
const WALK_F = 4.3, WALK_B = 3.4, JUMP_V = 16.6, JUMP_VX = 5.6;
const PUSH_R = 34;
const BLEND = 5;                                  // pose cross-fade, ticks

let serialSeq = 1;

export class Fighter {
  constructor(id, side, match) {
    this.id = id;
    this.def = FIGHTERS[id];
    this.side = side;                             // 0 = left (player), 1 = right (CPU)
    this.match = match;
    this.body = scaledBody(this.def);
    this.standHip = restingHip(POSES.stance, this.body);
    this.maxHp = this.def.hp;
    this.dmgOut = 1;
    this.dmgIn = 1;
    this.speedMul = this.def.speed;
    this.wins = 0;
    this.skel = {};
    this.trail = [];                              // recent skeletons for afterimages
    this.reach = computeReach(this.body);
    this.reset(0, 1);
  }

  reset(x, facing) {
    this.hp = this.maxHp;
    this.x = x; this.y = 0; this.vx = 0; this.vy = 0;
    this.facing = facing;
    this.state = 'intro'; this.st = 0;
    this.move = null; this.moveId = null; this.hitDone = false;
    this.buf = { p: 0, k: 0, s: 0, u: 0 };
    this.stunFor = 0; this.hitKind = 'high'; this.bType = 'stand';
    this.hitstop = 0; this.cooldown = 0; this.invuln = 0;
    this.comboTaken = 0; this.flash = 0; this.alpha = 1; this.hidden = false;
    this.airUsed = false; this.flip = 0; this.landFor = 5;
    this.ko = false; this.koRise = false; this.spec = null;
    this.serial = 0; this.pose = null; this.prevPose = null; this.blendT = BLEND;
    this.trail.length = 0;
    this.lastState = 'intro';
  }

  get opp() { return this.match.fighters[1 - this.side]; }
  get air() { return this.y > 0 || AIRBORNE.has(this.state) || (this.spec && this.spec.air); }
  get neutral() { return NEUTRAL.has(this.state); }

  set(state) {
    if (this.state !== state) { this.state = state; this.st = 0; }
  }

  faceOpp() {
    const o = this.opp;
    if (o.x > this.x + 2) this.facing = 1;
    else if (o.x < this.x - 2) this.facing = -1;
  }

  /* ------------------------------------------------------------- update */
  update(inp) {
    for (const key of ['p', 'k', 's', 'u']) if (inp.pressed[key]) this.buf[key] = BUFFER;
    if (this.hitstop > 0) { this.hitstop--; return; }
    for (const key in this.buf) if (this.buf[key] > 0) this.buf[key]--;
    this.st++;
    if (this.cooldown > 0) this.cooldown--;
    if (this.invuln > 0) this.invuln--;
    if (this.flash > 0) this.flash--;

    const h = inp.held;
    const fwd = this.facing > 0 ? h.r : h.l;
    const back = this.facing > 0 ? h.l : h.r;
    const m = this.match;

    switch (this.state) {
      case 'intro': case 'victory': case 'gone':
        this.vx *= 0.8; this.x += this.vx;
        break;

      case 'idle': case 'walk': case 'crouch': case 'block': case 'cblock':
        this.comboTaken = 0;
        this.doNeutral(h, fwd, back);
        this.x += this.vx;
        break;

      case 'jump': {
        if (!this.airUsed && (this.buf.p || this.buf.k)) {
          const key = this.buf.p ? 'p' : 'k';
          this.buf[key] = 0;
          this.airUsed = true;
          this.startMove(key === 'p' ? 'apunch' : 'akick', true);
        }
        if (this.airStep()) this.landing(4);
        break;
      }

      case 'land':
        this.vx *= 0.6; this.x += this.vx;
        if (this.st >= this.landFor) { this.set('idle'); this.doNeutral(h, fwd, back); }
        break;

      case 'attack': this.doAttack(h); break;

      case 'hit':
        this.vx *= 0.86; this.x += this.vx;
        if (this.st >= this.stunFor) { this.set('idle'); this.doNeutral(h, fwd, back); }
        break;

      case 'bstun':
        this.vx *= 0.84; this.x += this.vx;
        if (this.st >= this.stunFor) {
          this.set(h.b ? (h.d ? 'cblock' : 'block') : 'idle');
          if (!h.b) this.doNeutral(h, fwd, back);
        }
        break;

      case 'air':
        if (this.airStep()) {
          this.set('down'); this.vx *= 0.3;
          m.emit({ type: 'thud', x: this.x, power: Math.min(1, Math.abs(this.vy) / 14), f: this });
        }
        break;

      case 'down':
        this.vx *= 0.8; this.x += this.vx;
        if (this.ko) {
          if (this.koRise && this.st >= 56) { this.set('getup'); this.invuln = 0; }
        } else if (this.st >= 34) { this.set('getup'); this.invuln = 24; }
        break;

      case 'getup':
        if (this.st >= 22) {
          if (this.ko && this.koRise) this.set('dizzy');
          else { this.set('idle'); this.doNeutral(h, fwd, back); }
        }
        break;

      case 'dizzy':
        this.vx *= 0.8; this.x += this.vx;
        break;

      case 'special': this.doSpecial(h); break;

      case 'exec':
        this.vx *= 0.8; this.x += this.vx;
        if (this.st === 34) m.execute(this, this.opp);
        if (this.st >= 70) this.set('victory');
        break;
    }
  }

  doNeutral(h, fwd, back) {
    const m = this.match;
    this.faceOpp();
    if (m.phase === 'finish' && this.opp.state === 'dizzy' && this.buf.s) {
      this.buf.s = 0;
      // one button on a phone: the executioner closes the distance itself
      const o = this.opp;
      const dir = Math.sign(o.x - this.x) || this.facing;
      if (Math.abs(o.x - this.x) > 170) {
        const from = this.x;
        this.x = clamp(o.x - dir * 150, WALL, STAGE_W - WALL);
        m.emit({ type: 'teleport', f: this, from, to: this.x });
      }
      this.faceOpp();
      this.set('exec'); this.vx = 0;
      m.beginFinisher(this);
      return;
    }
    if (this.buf.s && this.cooldown === 0 && this.canSpecial()) return this.startSpecial();
    if (this.buf.p) { this.buf.p = 0; return this.startMove(h.d ? 'upper' : 'jab'); }
    if (this.buf.k) { this.buf.k = 0; return this.startMove(h.d ? 'sweep' : 'kick'); }
    if (this.buf.u || h.u) { this.buf.u = 0; return this.startJump(fwd ? 1 : back ? -1 : 0); }
    if (h.b) { this.set(h.d ? 'cblock' : 'block'); this.bType = h.d ? 'crouch' : 'stand'; this.vx = 0; return; }
    if (h.d) { this.set('crouch'); this.vx = 0; return; }
    if (fwd || back) {
      if (this.state !== 'walk') this.set('walk');
      this.walkDir = fwd ? 1 : -1;
      this.vx = (fwd ? WALK_F : -WALK_B) * this.speedMul * this.facing;
      return;
    }
    this.set('idle'); this.vx = 0;
  }

  startJump(dir) {
    this.set('jump');
    this.vy = JUMP_V;
    this.vx = dir * JUMP_VX * Math.sqrt(this.speedMul) * this.facing;
    this.flip = dir;
    this.airUsed = false;
    this.serial = serialSeq++;
    this.y = 0.01;
    this.match.emit({ type: 'jump', f: this });
  }

  airStep() {
    this.vy -= GRAVITY;
    this.x += this.vx;
    this.y += this.vy;
    if (this.y <= 0) { this.y = 0; return true; }
    return false;
  }

  landing(frames) {
    this.landFor = frames;
    this.set('land');
    this.vy = 0; this.flip = 0; this.spec = null; this.move = null;
    this.faceOpp();
    this.match.emit({ type: 'land', f: this });
  }

  startMove(id, air = false) {
    this.move = MOVES[id];
    this.moveId = id;
    this.hitDone = false;
    this.serial = serialSeq++;
    this.state = 'attack';
    this.st = 0;
    if (!air) this.vx = 0;
    this.match.emit({ type: 'whoosh', f: this, heavy: this.move.sfx !== 'light' });
  }

  isActive() {
    if (this.state === 'attack') {
      const mv = this.move;
      return this.st >= mv.startup && this.st < mv.startup + mv.active && !this.hitDone;
    }
    if (this.state === 'special' && this.spec) return !!this.spec.active && !this.hitDone;
    return false;
  }

  attackPhase() {
    if (this.state === 'attack') {
      const mv = this.move;
      if (this.st < mv.startup) return 'startup';
      if (this.st < mv.startup + mv.active) return 'active';
      return 'recovery';
    }
    if (this.state === 'special' && this.spec) return this.spec.phase;
    return null;
  }

  doAttack(h) {
    const mv = this.move;
    if (mv.air) {
      if (this.airStep()) this.landing(6);
      return;
    }
    const s = mv.startup, a = mv.active;
    if (mv.step && this.st >= s - 2 && this.st < s + a) this.vx = mv.step * this.facing;
    else this.vx *= 0.7;
    this.x += this.vx;
    if (mv.chain && this.st >= s) {
      for (const key of ['p', 'k']) {
        const next = mv.chain[key];
        if (next && this.buf[key] && (this.hitDone || this.st >= s + a)) {
          this.buf[key] = 0;
          this.startMove(next);
          return;
        }
      }
    }
    if (this.st >= s + a + mv.recovery) {
      this.move = null;
      this.set(mv.end === 'crouch' && h.d ? 'crouch' : 'idle');
    }
  }

  /* ----------------------------------------------------------- specials */
  canSpecial() {
    const sp = this.def.special;
    if (sp.type === 'projectile' || (sp.type === 'sovereign' && this.sovereignMode() === 'proj')) {
      return !this.match.projectiles.some((p) => p.owner === this && !p.dead && p.kind !== 'quake');
    }
    return true;
  }

  sovereignMode() {
    return Math.abs(this.opp.x - this.x) > 360 ? 'proj' : 'slam';
  }

  startSpecial() {
    const sp = this.def.special;
    this.buf.s = 0;
    this.cooldown = sp.cooldown;
    this.hitDone = false;
    this.serial = serialSeq++;
    this.move = null;
    let type = sp.type;
    if (type === 'sovereign') type = this.sovereignMode() === 'proj' ? 'projectile' : 'slam';
    this.spec = { type, phase: 'startup', active: false, air: false };
    this.state = 'special'; this.st = 0; this.vx = 0;
    this.match.emit({ type: 'special', f: this, kind: type });
  }

  specialHit() {
    const sp = this.def.special;
    const t = this.spec.type;
    return {
      dmg: sp.dmg, stun: 22, bstun: 16, knock: t === 'dash' ? 11 : 8, level: 'mid',
      knockdown: t !== 'teleport', launch: t === 'rising' ? 14 : 9, hitstop: 11,
      sfx: 'crush', special: true
    };
  }

  doSpecial(h) {
    const sp = this.spec;
    const st = this.st;
    const m = this.match;
    const done = () => { this.spec = null; this.set('idle'); this.doNeutral(h, false, false); };

    switch (sp.type) {
      case 'projectile': {
        sp.phase = st < 14 ? 'startup' : 'recovery';
        if (st === 14) {
          const hand = this.worldPoint('hf');
          const def = this.def.special;
          m.spawn({
            owner: this, kind: def.kind, x: hand[0] + this.facing * 20, y: Math.max(120, hand[1]),
            vx: def.speed * this.facing, r: 30, dmg: def.dmg, level: 'mid'
          });
        }
        this.vx *= 0.8; this.x += this.vx;
        if (st >= 36) done();
        break;
      }
      case 'dash': {
        if (st < 10) { sp.phase = 'startup'; this.vx = -1.2 * this.facing; }
        else if (st < 30 && !this.hitDone) { sp.phase = 'active'; sp.active = true; this.vx = 15.5 * this.facing; }
        else { sp.phase = 'recovery'; sp.active = false; this.vx *= 0.78; }
        this.x += this.vx;
        if (st >= 50 || (this.hitDone && st >= sp.hitAt + 16)) done();
        break;
      }
      case 'teleport': {
        const o = this.opp;
        if (st < 13) { sp.phase = 'startup'; this.alpha = 1 - st / 13; this.invuln = 4; }
        if (st === 13) {
          const from = this.x;
          const dir = Math.sign(o.x - this.x) || this.facing;
          let nx = o.x + dir * 120;
          if (nx < WALL || nx > STAGE_W - WALL) nx = o.x - dir * 120;
          this.x = clamp(nx, WALL, STAGE_W - WALL);
          this.y = 0;
          this.faceOpp();
          m.emit({ type: 'teleport', f: this, from, to: this.x });
        }
        if (st >= 13 && st < 22) { this.alpha = (st - 13) / 9; this.invuln = Math.max(this.invuln, 2); this.faceOpp(); }
        if (st >= 22) this.alpha = 1;
        sp.active = st >= 22 && st < 28;
        if (st >= 22) sp.phase = sp.active ? 'active' : 'recovery';
        if (st >= 46) done();
        break;
      }
      case 'rising': {
        if (st < 10) this.invuln = Math.max(this.invuln, 2);
        if (st < 5) { sp.phase = 'startup'; break; }
        if (st === 5) { this.vy = 15.8; this.vx = 2.6 * this.facing; this.y = 0.01; sp.air = true; }
        sp.active = this.vy > -3 && !this.hitDone;
        sp.phase = sp.active ? 'active' : 'recovery';
        if (this.airStep()) { this.landing(16); }
        break;
      }
      case 'slam': {
        if (st < 9) { sp.phase = 'startup'; break; }
        if (st === 9) { this.vy = 10.5; this.vx = 2.2 * this.facing; this.y = 0.01; sp.air = true; }
        sp.phase = 'startup';
        if (this.airStep()) {
          const def = this.def.special;
          m.spawn({ owner: this, kind: 'quake', x: this.x + this.facing * 70, y: 14, vx: 9.5 * this.facing, r: 34, dmg: def.dmg, level: 'low', life: 80 });
          m.emit({ type: 'quake', f: this, x: this.x + this.facing * 60 });
          this.landing(20);
        }
        break;
      }
    }
  }

  /* ------------------------------------------------------------- posing */
  targetPose() {
    const st = this.st;
    const mv = this.move;
    let p, grounded = true;
    switch (this.state) {
      case 'intro': p = track([['intro'], ['intro', 1]], 0); break;
      case 'idle': {
        const k = (Math.sin((this.match.tick + this.side * 17) * 0.085) + 1) / 2;
        p = lerpPose(POSES.stance, POSES.stance2, k);
        break;
      }
      case 'walk': {
        const cyc = ['walk1', 'walk2', 'walk3', 'walk4'];
        const spd = 7 / this.speedMul;
        const f = (st / spd) * (this.walkDir || 1);
        const i = ((Math.floor(f) % 4) + 4) % 4;
        p = lerpPose(POSES[cyc[i]], POSES[cyc[(i + 1) % 4]], f - Math.floor(f));
        break;
      }
      case 'crouch': p = track([['crouch'], ['crouch', 1]], 0); break;
      case 'block': p = track([['block'], ['block', 1]], 0); break;
      case 'cblock': p = track([['cblock'], ['cblock', 1]], 0); break;
      case 'bstun': p = track([[this.bType === 'crouch' ? 'cblock' : 'block'], ['block', 1]], 0); if (this.bType !== 'crouch') p.x -= 6; break;
      case 'jump': {
        grounded = false;
        p = this.flip ? track([['jump'], ['tuck', 10, 'out'], ['tuck', 14], ['jump', 10]], st) : track([['jump'], ['jump', 1]], 0);
        if (this.flip) p.rot = clamp((st - 4) / 30, 0, 1) * 360 * this.flip;
        break;
      }
      case 'land': p = track([['land'], ['stance', this.landFor + 2, 'out']], st); break;
      case 'attack': {
        const s = mv.startup, a = mv.active;
        if (mv.air) {
          grounded = false;
          p = track([['jump'], [mv.pose + '_c', s, 'out'], [mv.pose, 2, 'out']], st);
        } else {
          const end = mv.end || 'stance';
          const rec = mv.recovery;
          p = track([
            [mv.base], [mv.pose + '_c', s - 1, 'out'], [mv.pose, 2, 'out'],
            [mv.pose, Math.max(1, a - 1 + Math.round(rec * 0.25))], [end, Math.round(rec * 0.75), 'inOut']
          ], st);
        }
        break;
      }
      case 'hit': {
        const name = this.hitKind === 'low' ? 'hit_low' : this.hitKind === 'crouch' ? 'hit_crouch' : 'hit_high';
        p = track([['stance'], [name, 3, 'out'], [name, Math.max(1, this.stunFor - 10)], ['stance', 7]], st);
        break;
      }
      case 'air': {
        grounded = false;
        const k = clamp((8 - this.vy) / 22, 0, 1);
        p = lerpPose(POSES.launched, POSES.falling, k);
        p.rot = -20 - 70 * k;
        break;
      }
      case 'down': p = track([['down'], ['down', 1]], 0); break;
      case 'getup': p = track([['down'], ['rise', 10, 'out'], ['stance', 12]], st); break;
      case 'dizzy': {
        const k = (Math.sin(this.match.tick * 0.07) + 1) / 2;
        p = lerpPose(POSES.dizzy, POSES.dizzy2, k);
        p.x = Math.sin(this.match.tick * 0.05) * 10;
        break;
      }
      case 'victory': p = track([['victory_c'], ['victory', 16, 'out']], st); break;
      case 'gone': p = track([['down'], ['down', 1]], 0); break;
      case 'exec': p = track([['stance'], ['exec_c', 24, 'out'], ['exec', 8, 'out'], ['exec', 40]], st); break;
      case 'special': {
        const sp = this.spec;
        switch (sp && sp.type) {
          case 'projectile': p = track([['stance'], ['cast_c', 11, 'out'], ['cast', 4, 'out'], ['cast', 10], ['stance', 10]], st); break;
          case 'dash': p = track([['stance'], ['cast_c', 9, 'out'], ['dash', 3, 'out'], ['dash', 22], ['stance', 14]], st); break;
          case 'teleport': p = track([['stance'], ['vanish', 12], ['vanish', 8], ['strike', 3, 'out'], ['strike', 6], ['stance', 16]], st); break;
          case 'rising':
            if (sp.air) { grounded = false; p = track([['rising_c'], ['rising', 4, 'out'], ['rising', 14], ['jump', 14]], st - 5); }
            else p = track([['stance'], ['rising_c', 5, 'out']], st);
            break;
          case 'slam':
            if (sp.air) { grounded = false; p = track([['slam_up'], ['slam_up', 8], ['slam', 8, 'in']], st - 9); }
            else p = track([['stance'], ['slam_up', 9, 'out']], st);
            break;
          default: p = lerpPose(POSES.stance, POSES.stance, 0);
        }
        break;
      }
      default: p = lerpPose(POSES.stance, POSES.stance, 0);
    }
    p.oy = grounded ? groundOffset(p, this.body) : this.standHip + p.y;
    return p;
  }

  updatePose() {
    const target = this.targetPose();
    const key = this.state === 'attack' || this.state === 'special' ? this.state + this.serial : this.state;
    if (key !== this.lastState) {
      // states that must read instantly (impacts) skip the cross-fade
      const snap = this.state === 'hit' || this.state === 'air' || this.state === 'bstun';
      this.prevPose = this.pose;
      this.blendT = snap || !this.prevPose ? BLEND : 0;
      this.lastState = key;
    }
    if (this.blendT < BLEND && this.prevPose) {
      this.blendT++;
      const k = this.blendT / BLEND;
      this.pose = lerpPose(this.prevPose, target, k * (2 - k));
      if (Math.abs(target.rot - this.prevPose.rot) > 180) this.pose.rot = target.rot;
    } else {
      this.pose = target;
    }
    solve(this.pose, this.body, this.skel);
    if (this.state === 'special' && this.spec && (this.spec.type === 'dash' || this.spec.type === 'teleport' || this.spec.type === 'rising')) {
      this.trail.unshift({ skel: cloneSkel(this.skel), x: this.x, y: this.y, facing: this.facing, life: 1 });
      if (this.trail.length > 6) this.trail.pop();
    } else if (this.trail.length) {
      this.trail.pop();
    }
  }

  worldPoint(name) {
    const q = this.skel[name];
    return [this.x + q[0] * this.facing, this.y + q[1]];
  }

  /* hurt capsules in world space: [ax, ay, bx, by, r] */
  hurtCapsules() {
    const s = this.body.scale, k = this.body.bulk;
    const w = (n) => this.worldPoint(n);
    const hip = w('hip'), neck = w('neck'), head = w('head');
    const out = [
      [...hip, ...neck, 27 * s * Math.max(0.9, k)],
      [...head, ...head, this.body.head + 3],
      [...w('hipF'), ...w('knF'), 15 * s],
      [...w('hipB'), ...w('knB'), 15 * s],
      [...w('knF'), ...w('anF'), 12 * s],
      [...w('knB'), ...w('anB'), 12 * s],
      [...w('shF'), ...w('elF'), 11 * s]
    ];
    return out;
  }
}

function cloneSkel(s) {
  const o = {};
  for (const k in s) o[k] = Array.isArray(s[k]) ? [s[k][0], s[k][1]] : s[k];
  return o;
}

/* Horizontal reach of each normal from the fighter's own centre. The AI
   uses it to choose moves by distance instead of hard-coded magic numbers. */
function computeReach(body) {
  const out = {};
  for (const id in MOVES) {
    const mv = MOVES[id];
    const p = { ...POSES[mv.pose], oy: 0 };
    const sk = solve(p, body, {});
    out[id] = sk[mv.fx][0] + mv.r;
  }
  return out;
}

function segDist2(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const l2 = dx * dx + dy * dy;
  let t = l2 > 0 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0;
  t = clamp(t, 0, 1);
  const cx = ax + dx * t - px, cy = ay + dy * t - py;
  return cx * cx + cy * cy;
}

/* ================================================================= Match */

export class Match {
  constructor({ p1, p2, seed = 1, viewW = 1280, p1Mods = {}, p2Mods = {} }) {
    this.rng = rng32(seed);
    this.tick = 0;
    this.viewW = viewW;
    this.fighters = [new Fighter(p1, 0, this), new Fighter(p2, 1, this)];
    Object.assign(this.fighters[0], p1Mods);
    Object.assign(this.fighters[1], p2Mods);
    this.projectiles = [];
    this.events = [];
    this.round = 0;
    this.cam = { x: STAGE_W / 2, y: 0 };
    this.timeScale = 1;
    this.slow = 0;
    this.winner = null;
    this.over = false;
    this.draws = 0;
    this.nextRound();
  }

  emit(e) { this.events.push(e); }
  drain() { const e = this.events; this.events = []; return e; }

  nextRound() {
    this.round++;
    const [a, b] = this.fighters;
    a.reset(STAGE_W / 2 - 230, 1);
    b.reset(STAGE_W / 2 + 230, -1);
    this.projectiles.length = 0;
    this.timer = ROUND_TIME;
    this.timerTick = 0;
    this.phase = 'intro';
    this.phaseT = 0;
    this.koWinner = null;
    this.cam.x = STAGE_W / 2;
    this.slow = 0;
    this.timeScale = 1;
    this.emit({ type: 'round', round: this.round });
  }

  setPhase(p) { this.phase = p; this.phaseT = 0; }

  spawn(p) {
    this.projectiles.push({ life: 200, dead: false, age: 0, ...p });
    this.emit({ type: 'proj', p });
  }

  update(i1, i2) {
    this.tick++;
    this.phaseT++;
    const [a, b] = this.fighters;
    if (this.slow > 0) { this.slow--; this.timeScale = this.slow > 0 ? 0.32 : 1; }

    this.phaseLogic();

    const live = this.phase === 'fight' || this.phase === 'finish';
    const none = blankInput();
    a.update(live || this.phase === 'ko' ? i1 : none);
    b.update(live || this.phase === 'ko' ? i2 : none);
    a.updatePose();
    b.updatePose();

    this.checkHits(a, b);
    this.checkHits(b, a);
    this.updateProjectiles();
    this.resolvePush(a, b);
    this.updateCamera();
  }

  phaseLogic() {
    const [a, b] = this.fighters;
    const t = this.phaseT;
    switch (this.phase) {
      case 'intro': {
        if (t === 12) {
          const final = a.wins === ROUNDS_TO_WIN - 1 && b.wins === ROUNDS_TO_WIN - 1;
          this.emit({ type: 'announce', text: final ? 'FINAL ROUND' : `ROUND ${this.round}`, kind: 'round' });
        }
        if (t === 78) this.emit({ type: 'announce', text: 'FIGHT!', kind: 'fight' });
        if (t >= 84) {
          a.set('idle'); b.set('idle');
          this.setPhase('fight');
        }
        break;
      }
      case 'fight': {
        if (++this.timerTick >= HZ) {
          this.timerTick = 0;
          this.timer = Math.max(0, this.timer - 1);
          if (this.timer === 0) this.timeUp();
        }
        break;
      }
      case 'ko': {
        const w = this.koWinner, l = w.opp;
        if (l.state === 'dizzy') {
          this.setPhase('finish');
          this.finishLeft = 330;
          this.emit({ type: 'announce', text: 'EXECUTE!', kind: 'finish', who: w.side });
        } else if (!l.koRise && l.state === 'down' && l.st > 40 && (w.neutral || w.state === 'land')) {
          w.set('victory');
          this.setPhase('roundover');
        } else if (t > 600) {
          this.setPhase('roundover');
        }
        break;
      }
      case 'finish': {
        const w = this.koWinner, l = w.opp;
        if (l.state === 'dizzy' && w.state !== 'exec' && --this.finishLeft <= 0) {
          l.koRise = false; l.set('air'); l.vy = 3; l.y = 0.01; l.vx = 0;
          w.set('victory');
          this.setPhase('roundover');
        } else if (l.state !== 'dizzy' && w.state !== 'exec' && l.state !== 'gone') {
          // knocked down with a normal hit instead of executed
          if (l.state === 'down' && l.st > 30) { w.set('victory'); this.setPhase('roundover'); }
        }
        break;
      }
      case 'finisher': {
        if (t === 150) this.emit({ type: 'announce', text: 'EXECUTION', kind: 'exec' });
        if (t >= 250) this.setPhase('roundover');
        break;
      }
      case 'timeup': {
        if (t === 1) this.emit({ type: 'announce', text: 'TIME', kind: 'time' });
        if (t >= 120) this.setPhase('roundover');
        break;
      }
      case 'roundover': {
        const w = this.koWinner;
        if (t === 20) {
          if (w) {
            this.emit({ type: 'announce', text: `${w.def.name} WINS`, kind: 'wins', who: w.side });
            if (w.hp === w.maxHp) this.emit({ type: 'announce', text: 'PERFECT', kind: 'perfect', delay: 60 });
          } else {
            this.emit({ type: 'announce', text: 'DRAW', kind: 'wins' });
          }
        }
        if (w && t === 20 && w.state !== 'victory' && w.state !== 'exec') w.set('victory');
        if (t >= 170) {
          const champ = this.fighters.find((f) => f.wins >= ROUNDS_TO_WIN);
          if (champ || this.round >= 7) {
            this.winner = champ || a;
            this.over = true;
            this.setPhase('matchover');
            this.emit({ type: 'matchover', winner: this.winner.side });
          } else {
            this.nextRound();
          }
        }
        break;
      }
    }
  }

  timeUp() {
    const [a, b] = this.fighters;
    this.projectiles.length = 0;
    if (a.hp === b.hp) {
      this.koWinner = null;
      this.draws++;
    } else {
      const w = a.hp > b.hp ? a : b;
      const l = w.opp;
      w.wins++;
      this.koWinner = w;
      l.ko = true; l.koRise = false;
      l.set('air'); l.vy = 4; l.y = Math.max(l.y, 0.01); l.vx = 0; l.move = null; l.spec = null;
      w.move = null; w.spec = null; w.set('victory'); w.y = 0;
    }
    this.setPhase('timeup');
  }

  /* --------------------------------------------------------------- hits */
  checkHits(att, def) {
    if (!att.isActive()) return;
    let info, fx, r;
    if (att.state === 'attack') {
      const mv = att.move;
      info = mv; fx = mv.fx; r = mv.r * att.body.scale;
    } else {
      info = att.specialHit();
      const t = att.spec.type;
      fx = t === 'rising' ? 'ff' : 'hf';
      r = (t === 'dash' ? 42 : 36) * att.body.scale;
    }
    const pt = att.worldPoint(fx);
    if (this.overlaps(def, pt[0], pt[1], r)) {
      att.hitDone = true;
      if (att.spec) att.spec.hitAt = att.st;
      this.applyHit(att, def, info, pt);
    }
  }

  overlaps(f, x, y, r) {
    if (f.hidden) return false;
    for (const c of f.hurtCapsules()) {
      const rr = r + c[4];
      if (segDist2(x, y, c[0], c[1], c[2], c[3]) < rr * rr) return true;
    }
    return false;
  }

  hittable(def) {
    if (def.hidden || def.state === 'gone' || def.state === 'down' || def.state === 'getup') return false;
    if (this.phase === 'fight') return def.invuln <= 0;
    if (this.phase === 'finish') return def.state === 'dizzy';
    return false;
  }

  applyHit(att, def, info, pt) {
    if (!this.hittable(def)) return false;
    const dir = Math.sign(def.x - att.x) || att.facing;
    const lvl = info.level;
    const standBlock = (def.state === 'block' || (def.state === 'bstun' && def.bType === 'stand')) && lvl !== 'low';
    const crouchBlock = (def.state === 'cblock' || (def.state === 'bstun' && def.bType === 'crouch')) && lvl !== 'overhead';
    const dizzy = def.state === 'dizzy';

    if (!dizzy && (standBlock || crouchBlock)) {
      const chip = info.special ? Math.round(info.dmg * 0.14 * att.dmgOut * def.dmgIn) : 0;
      def.hp = Math.max(1, def.hp - chip);
      def.bType = crouchBlock && !standBlock ? 'crouch' : 'stand';
      def.state = 'bstun'; def.st = 0;
      def.stunFor = info.bstun;
      def.vx = dir * info.knock * 0.9;
      att.hitstop = def.hitstop = 4;
      if (this.atWall(def)) att.vx = -dir * info.knock * 0.7;
      this.emit({ type: 'block', x: pt[0], y: pt[1], f: def, att });
      return true;
    }

    const scaling = Math.max(0.4, 1 - 0.12 * def.comboTaken);
    const dmg = Math.max(1, Math.round(info.dmg * att.def.power * att.dmgOut * def.dmgIn * scaling));
    def.hp = Math.max(0, def.hp - dmg);
    def.comboTaken++;
    const wasAir = def.y > 0 || def.state === 'air';
    const crouching = def.state === 'crouch' || def.state === 'cblock' || (def.state === 'attack' && def.move && def.move.base === 'crouch');
    def.move = null;
    def.spec = null;
    def.flash = 6;
    def.alpha = 1;
    def.hitstop = att.hitstop = info.hitstop;

    if (def.hp <= 0 || dizzy) {
      this.knockOut(att, def, dir, info, dizzy);
    } else if (info.knockdown || wasAir) {
      def.state = 'air'; def.st = 0;
      const juggle = wasAir ? Math.max(4, (info.launch || 8) * 0.55 - def.comboTaken * 0.5) : (info.launch || 8);
      def.vy = juggle;
      def.vx = dir * (info.knock * 0.55 + 1.6);
      def.y = Math.max(def.y, 1);
    } else {
      def.state = 'hit'; def.st = 0;
      def.hitKind = crouching ? 'crouch' : (lvl === 'low' || info.knock > 6.5) ? 'low' : 'high';
      def.stunFor = info.stun;
      def.vx = dir * info.knock;
    }
    if (this.atWall(def)) att.vx = -dir * info.knock * 0.6;

    this.emit({
      type: 'hit', x: pt[0], y: pt[1], dmg, dir, f: def, att, sfx: info.sfx,
      heavy: info.hitstop >= 8, special: !!info.special, combo: def.comboTaken
    });
    return true;
  }

  knockOut(att, def, dir, info, wasDizzy) {
    def.hp = 0;
    def.ko = true;
    def.state = 'air'; def.st = 0;
    def.vy = Math.max(info.launch || 0, 11);
    def.vx = dir * 6.5;
    def.y = Math.max(def.y, 1);
    def.invuln = 0;
    this.projectiles.length = 0;
    if (wasDizzy) {
      def.koRise = false;
      return;
    }
    att.wins++;
    this.koWinner = att;
    def.koRise = att.wins >= ROUNDS_TO_WIN && !this.noFinish;
    this.slow = 70;
    this.timeScale = 0.32;
    this.setPhase('ko');
    this.emit({ type: 'ko', f: def, att });
  }

  beginFinisher(w) {
    this.setPhase('finisher');
    this.emit({ type: 'finisher', f: w });
  }

  execute(w, l) {
    l.state = 'gone'; l.st = 0; l.hidden = true;
    this.emit({ type: 'shatter', f: l, att: w, element: w.def.element.name });
  }

  atWall(f) { return f.x <= WALL + 2 || f.x >= STAGE_W - WALL - 2; }

  /* -------------------------------------------------------- projectiles */
  updateProjectiles() {
    const ps = this.projectiles;
    for (const p of ps) {
      if (p.dead) continue;
      p.age++;
      p.x += p.vx;
      if (--p.life <= 0 || p.x < -100 || p.x > STAGE_W + 100) { p.dead = true; continue; }
      const target = p.owner.opp;
      if (this.hittable(target) && this.overlaps(target, p.x, p.y, p.r)) {
        p.dead = true;
        const info = { dmg: p.dmg, stun: 22, bstun: 16, knock: 7, level: p.level, knockdown: p.kind !== 'fire', launch: 8, hitstop: 9, sfx: 'crush', special: true };
        if (!this.applyHit(p.owner, target, info, [p.x, p.y])) p.dead = false;
        else this.emit({ type: 'proj-hit', p });
        continue;
      }
      for (const q of ps) {
        if (q === p || q.dead || q.owner === p.owner) continue;
        if (Math.abs(q.x - p.x) < p.r + q.r && Math.abs(q.y - p.y) < p.r + q.r) {
          p.dead = q.dead = true;
          this.emit({ type: 'clash', x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 });
        }
      }
    }
    this.projectiles = ps.filter((p) => !p.dead);
  }

  /* ------------------------------------------------------ space + camera */
  resolvePush(a, b) {
    for (const f of this.fighters) f.x = clamp(f.x, WALL, STAGE_W - WALL);
    const solid = (f) => !f.hidden && f.state !== 'gone' && f.state !== 'down' && !(f.state === 'special' && f.spec && f.spec.type === 'teleport' && f.alpha < 0.6);
    if (solid(a) && solid(b) && Math.abs(a.y - b.y) < 110 * Math.max(a.body.scale, b.body.scale)) {
      const min = PUSH_R * (a.body.scale * a.body.bulk ** 0.3 + b.body.scale * b.body.bulk ** 0.3);
      const dx = b.x - a.x;
      const overlap = min - Math.abs(dx);
      if (overlap > 0) {
        const s = dx === 0 ? (a.facing > 0 ? 1 : -1) : Math.sign(dx);
        let pa = overlap / 2, pb = overlap / 2;
        if (this.atWall(a)) { pa = 0; pb = overlap; }
        if (this.atWall(b)) { pb = 0; pa = overlap; }
        a.x = clamp(a.x - s * pa, WALL, STAGE_W - WALL);
        b.x = clamp(b.x + s * pb, WALL, STAGE_W - WALL);
      }
    }
    // both fighters must stay on screen
    const maxSep = this.viewW - 170;
    const sep = b.x - a.x;
    if (Math.abs(sep) > maxSep) {
      const mid = this.cam.x;
      const over = (Math.abs(sep) - maxSep) / 2;
      const s = Math.sign(sep);
      // pull back whoever is further from the camera centre
      if (Math.abs(a.x - mid) > Math.abs(b.x - mid)) a.x += s * over * 2;
      else b.x -= s * over * 2;
    }
  }

  updateCamera() {
    const [a, b] = this.fighters;
    const vis = this.fighters.filter((f) => !f.hidden || this.phase === 'finisher');
    const mid = vis.length ? vis.reduce((s, f) => s + f.x, 0) / vis.length : (a.x + b.x) / 2;
    const half = this.viewW / 2;
    const tx = clamp(mid, half, STAGE_W - half);
    this.cam.x += (tx - this.cam.x) * 0.14;
    this.cam.x = clamp(this.cam.x, half, STAGE_W - half);
    const hy = Math.max(a.y, b.y);
    const ty = Math.max(0, hy - 150) * 0.45;
    this.cam.y += (ty - this.cam.y) * 0.1;
  }
}
