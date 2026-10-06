/* CPU opponent. It reads its opponent through a delay line -- `reaction`
   ticks in the past -- so a low-level AI is genuinely slow to notice an
   attack rather than artificially handicapped after the fact. Every knob
   comes from difficultyFor() in config.js.                               */

import { blankInput } from './engine.js';

export class AI {
  constructor(params, rng) {
    this.p = params;
    this.rng = rng;
    this.hist = [];
    this.plan = null;      // { hold: {...}, until: tick }
    this.nextThink = 0;
    this.reacted = 0;      // serial of the last attack it reacted to
    this.punished = 0;
    this.antiAired = 0;
    this.seenProj = new WeakSet();
    this.chainSerial = 0;
    this.airSerial = -1;
    this.finishTried = false;
    this.out = blankInput();
  }

  roll(p) { return this.rng() < p; }

  snapshot(o) {
    return {
      x: o.x, y: o.y, vy: o.vy, state: o.state, serial: o.serial,
      level: o.move ? o.move.level : (o.spec ? 'mid' : null),
      phase: o.attackPhase(), hitDone: o.hitDone, air: o.air, spec: o.spec ? o.spec.type : null
    };
  }

  press(key, mod = null) {
    this.out.pressed[key] = true;
    if (key in this.out.mods) this.out.mods[key] = mod;
  }

  /* the special slot that plays a role ('zone', 'rush', 'anti'), if ready */
  slot(me, role) {
    const i = me.def.specials.findIndex((s) => s.role === role);
    return i >= 0 && me.cools[i] === 0 && me.canSpecial(i) ? i : -1;
  }
  special(i) { this.press('s', ['n', 'f', 'u'][i]); }

  hold(h, ticks, now) { this.plan = { hold: h, until: now + ticks }; }

  update(me, match) {
    const o = me.opp;
    const now = match.tick;
    const P = this.p;
    const out = this.out;
    for (const k in out.pressed) out.pressed[k] = false;
    for (const k in out.held) out.held[k] = false;
    for (const k in out.mods) out.mods[k] = null;
    out.dash = null;

    this.hist.push(this.snapshot(o));
    if (this.hist.length > 80) this.hist.shift();
    const v = this.hist[Math.max(0, this.hist.length - 1 - P.reaction)];

    const toward = o.x > me.x ? 'r' : 'l';
    const away = toward === 'r' ? 'l' : 'r';
    const dist = Math.abs(o.x - me.x);
    const seenDist = Math.abs(v.x - me.x);

    if (match.phase === 'finish') return this.finish(me, o, toward, dist, now);
    if (match.phase !== 'fight') return out;

    /* ---- in the middle of something: strings and air attacks only ---- */
    if (me.state === 'attack' && me.move && me.move.chain && me.serial !== this.chainSerial) {
      if (me.st >= me.move.startup) {
        this.chainSerial = me.serial;
        if (me.hitDone && this.roll(P.combo * 0.45)) {
          // cancel the string into a special
          const i = [this.slot(me, 'rush'), this.slot(me, 'zone'), this.slot(me, 'anti')].find((x) => x >= 0);
          if (i !== undefined) { this.special(i); return out; }
        }
        if (this.roll(P.combo) && (me.hitDone || this.roll(0.3))) {
          const keys = Object.keys(me.move.chain);
          const k = keys[Math.floor(this.rng() * keys.length)];
          this.press(k[0], k[1] || null);
        }
      }
      return out;
    }
    if (me.state === 'jump' && me.serial !== this.airSerial && !me.airUsed) {
      if (dist < 175 && me.vy < 6 && Math.abs(me.y - o.y) < 200) {
        this.airSerial = me.serial;
        this.press(this.roll(0.5) ? 'k' : 'p');
      }
      return out;
    }
    if (!me.neutral) { this.plan = null; return out; }

    /* ------------------------------------------------- reactive layer -- */
    const reach = me.reach;
    // an attack it has now "seen"
    if ((v.state === 'attack' || v.state === 'special') && v.serial !== this.reacted &&
        (v.phase === 'startup' || v.phase === 'active')) {
      this.reacted = v.serial;
      const threat = v.spec === 'dash' || v.spec === 'teleport' || seenDist < 270;
      if (threat && this.roll(P.block)) {
        const low = v.level === 'low';
        this.hold({ b: true, d: low }, 18 + Math.floor(this.rng() * 10), now);
      }
    }
    // incoming projectiles
    for (const pr of match.projectiles) {
      if (pr.owner === me || this.seenProj.has(pr)) continue;
      const eta = (me.x - pr.x) / (pr.vx || 1);
      if (eta > 0 && eta < 34 + P.reaction * 0.3 && pr.age > P.reaction * 0.5) {
        this.seenProj.add(pr);
        if (this.roll(P.block)) {
          if (pr.kind !== 'quake' && this.roll(0.35 * P.antiAir)) { this.plan = null; this.press('u'); out.held[toward] = true; return out; }
          this.hold({ b: true, d: pr.kind === 'quake' }, Math.min(50, Math.ceil(eta) + 12), now);
        } else if (pr.kind === 'quake' && this.roll(P.antiAir)) {
          this.plan = null; this.press('u'); return out;
        }
      }
    }
    // anti-air
    if ((v.state === 'jump' || (v.air && v.state === 'attack')) && v.vy < 4 && seenDist < 240 && v.y < 190 &&
        v.serial !== this.antiAired && o.y > 20) {
      this.antiAired = v.serial || -now;
      if (this.roll(P.antiAir)) {
        this.plan = null;
        const anti = this.slot(me, 'anti');
        if (anti >= 0 && this.roll(0.35)) { this.special(anti); return out; }
        if (this.roll(0.3)) { this.press('k', 'u'); return out; }
        out.held.d = true; this.press('p');
        return out;
      }
    }
    // punish a whiffed move
    if (v.state === 'attack' && v.phase === 'recovery' && !v.hitDone && v.serial !== this.punished) {
      this.punished = v.serial;
      if (this.roll(P.punish)) {
        this.plan = null;
        if (dist < reach.upper + 20) { out.held.d = true; this.press('p'); return out; }
        if (dist < reach.kick + 10) { this.press('k'); return out; }
      }
    }

    /* ------------------------------------------------ continuing plan -- */
    if (this.plan && now < this.plan.until) {
      const h = this.plan.hold;
      for (const k of ['b', 'd', 'u']) if (h[k]) out.held[k] = true;
      if (h.toward) out.held[toward] = true;
      if (h.away) out.held[away] = true;
      if (this.plan.attackAt && dist < this.plan.attackAt) { this.plan = null; this.attackIn(me, o, dist, out); }
      return out;
    }
    this.plan = null;
    if (now < this.nextThink) return out;
    this.nextThink = now + P.think + Math.floor(this.rng() * P.think * 0.6);

    /* ----------------------------------------------- proactive layer -- */
    if (this.roll(P.whiff)) {
      // a mistake: a random move at the wrong range, or standing still
      if (this.roll(0.5)) this.press(this.roll(0.5) ? 'p' : 'k');
      return out;
    }
    const zone = this.slot(me, 'zone'), rush = this.slot(me, 'rush'), anti = this.slot(me, 'anti');
    const zoneDef = zone >= 0 ? me.def.specials[zone] : null;
    const ranged = zoneDef && zoneDef.type === 'projectile';
    const a = P.aggression;

    if (dist > 400) {
      if (zone >= 0 && (ranged || dist < 560) && this.roll(P.special * 2.2)) { this.special(zone); return out; }
      if (rush >= 0 && dist < 620 && this.roll(P.special)) { this.special(rush); return out; }
      if (this.roll(a * 0.25)) { out.dash = o.x > me.x ? 'r' : 'l'; return out; }
      if (this.roll(a + 0.2)) this.hold({ toward: true }, 20 + Math.floor(this.rng() * 30), now);
      else if (this.roll(0.3)) this.hold({ away: true }, 12, now);
      return out;
    }
    if (dist > reach.kick + 20) {
      if (rush >= 0 && this.roll(P.special)) { this.special(rush); return out; }
      if (zone >= 0 && this.roll(P.special * 0.6)) { this.special(zone); return out; }
      if (this.roll(a * 0.3)) { this.press('u'); out.held[toward] = true; return out; }
      if (this.roll(a * 0.35)) { out.dash = o.x > me.x ? 'r' : 'l'; return out; }
      if (this.roll(a + 0.15)) { this.plan = { hold: { toward: true }, until: now + 40, attackAt: reach.kick - 10 }; return out; }
      if (this.roll(0.35)) this.hold({ b: true }, 16, now);
      return out;
    }
    // close range
    if (this.roll(a)) { this.attackIn(me, o, dist, out); return out; }
    if (zone >= 0 && !ranged && this.roll(P.special * 0.6)) { this.special(zone); return out; }
    if (this.roll(0.12 * (1 - a))) { out.dash = o.x > me.x ? 'l' : 'r'; return out; }   // back-dash out
    if (this.roll(0.45)) this.hold({ b: true, d: this.roll(P.lows) }, 14 + Math.floor(this.rng() * 14), now);
    else this.hold({ away: true }, 10 + Math.floor(this.rng() * 12), now);
    return out;
  }

  attackIn(me, o, dist, out) {
    const r = me.reach;
    const blocking = o.state === 'block' || o.state === 'bstun';
    const crouching = o.state === 'crouch' || o.state === 'cblock';
    const opts = [];
    if (dist < r.jab + 12 && !crouching) opts.push(['jab', 3]);
    if (dist < r.cross + 8 && !crouching) opts.push(['cross', 1.2]);
    if (dist < r.kick + 12) opts.push(['kick', 2]);
    if (dist < r.spin + 8) opts.push(['spin', 1]);
    if (dist < r.lowpunch + 8) opts.push(['lowpunch', blocking ? 2 * this.p.lows * 4 : 0.6]);
    if (dist < r.sweep + 8) opts.push(['sweep', blocking ? 4 * this.p.lows * 4 : crouching ? 3 : this.p.lows * 3]);
    if (dist < r.upper + 15) opts.push(['upper', crouching ? 3 : 1.5]);
    if (blocking && dist < r.cpunch + 8) opts.push(['cpunch', 3 * this.p.lows * 3]);   // break the guard
    if (blocking && dist < r.ckick + 8) opts.push(['ckick', 2 * this.p.lows * 3]);
    if (!opts.length) { out.held[o.x > me.x ? 'r' : 'l'] = true; return; }
    let sum = 0;
    for (const [, w] of opts) sum += w;
    let pick = this.rng() * sum;
    let id = opts[0][0];
    for (const [m, w] of opts) { pick -= w; if (pick <= 0) { id = m; break; } }
    const MAP = {
      jab: ['p', null], cross: ['p', 'f'], kick: ['k', null], spin: ['k', 'f'], lowpunch: ['p', 'd'],
      sweep: ['k', 'd'], upper: ['p', 'u'], cpunch: ['p', 'c'], ckick: ['k', 'c']
    };
    const [key, mod] = MAP[id];
    this.press(key, mod);
  }

  finish(me, o, toward, dist, now) {
    const out = this.out;
    if (o.state !== 'dizzy' || !me.neutral) return out;
    if (!this.finishTried) {
      this.finishTried = true;
      this.wantsExec = this.roll(this.p.finisher);
      this.finishAt = now + 40 + Math.floor(this.rng() * 50);
    }
    if (now < this.finishAt) return out;
    if (this.wantsExec) {
      this.press('s', 'n');
    } else {
      if (dist > me.reach.kick) { out.held[toward] = true; return out; }
      this.press('k');
    }
    return out;
  }
}
