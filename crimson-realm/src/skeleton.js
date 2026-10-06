/* Pose library + forward kinematics.

   Angle conventions (degrees), for a fighter facing +x:
     t        torso lean from vertical, + leans forward
     h        head tilt relative to torso, + nods forward
     fau/bau  front/back upper arm, absolute, measured from straight down,
              + swings forward (90 = pointing straight ahead)
     fal/bal  forearm relative to upper arm, + folds forward/up
     flu/blu  front/back thigh, absolute from straight down, + forward
     fll/bll  shin relative to thigh, - bends the knee backwards
     x, y     root offset; y lifts the hips (air poses only)
     rot      whole-body rotation (flips, falls), + tips forward

   The skeleton is solved in "local" space with y up and the hip at the
   origin, then dropped so its lowest point rests on the floor for grounded
   poses. The engine mirrors by `facing` when placing it in the world.     */

import { clamp } from './config.js';

const D = Math.PI / 180;
export const POSE_KEYS = ['t', 'h', 'fau', 'fal', 'bau', 'bal', 'flu', 'fll', 'blu', 'bll', 'x', 'y', 'rot'];

const STANCE = { t: 9, h: -5, fau: 30, fal: 112, bau: 12, bal: 126, flu: 22, fll: -16, blu: -21, bll: -12, x: 0, y: 0, rot: 0 };

function P(o) {
  const p = {};
  for (const k of POSE_KEYS) p[k] = o[k] ?? STANCE[k];
  return p;
}

const CROUCH_LEGS = { flu: 82, fll: -92, blu: 10, bll: -100 };

export const POSES = {
  stance: P({}),
  stance2: P({ t: 11, h: -3, fau: 32, fal: 108, bau: 14, bal: 122, flu: 25, fll: -22, blu: -23, bll: -17 }),
  walk1: P({ flu: 30, fll: -10, blu: -22, bll: -22, fau: 26, bau: 18 }),
  walk2: P({ flu: 4, fll: -38, blu: 2, bll: -8, t: 11 }),
  walk3: P({ flu: -14, fll: -16, blu: 26, bll: -10, fau: 34, bau: 8 }),
  walk4: P({ flu: 6, fll: -6, blu: 4, bll: -40, t: 11 }),
  crouch: P({ t: 30, h: -18, fau: 40, fal: 104, bau: 26, bal: 118, ...CROUCH_LEGS }),
  block: P({ t: -4, h: 8, fau: 58, fal: 128, bau: 48, bal: 136, flu: 18, fll: -18, blu: -24, bll: -14 }),
  cblock: P({ t: 26, h: -6, fau: 62, fal: 124, bau: 52, bal: 132, ...CROUCH_LEGS }),

  jump: P({ t: 6, h: -6, fau: 50, fal: 100, bau: 30, bal: 110, flu: 58, fll: -96, blu: 18, bll: -88, y: 10 }),
  tuck: P({ t: 34, h: 10, fau: 70, fal: 120, bau: 60, bal: 126, flu: 112, fll: -146, blu: 96, bll: -142, y: 10 }),
  land: P({ t: 22, h: -10, fau: 40, fal: 104, bau: 20, bal: 116, flu: 46, fll: -64, blu: -30, bll: -40 }),

  jab: P({ t: 13, h: -4, fau: 88, fal: 3, bau: 16, bal: 124, flu: 28, fll: -14, blu: -26, bll: -6 }),
  jab_c: P({ t: 10, fau: 40, fal: 96, bau: 14, bal: 126 }),
  jab2: P({ t: 17, h: -2, fau: 26, fal: 118, bau: 87, bal: 3, flu: 30, fll: -14, blu: -28, bll: -6, x: 6 }),
  jab2_c: P({ t: 6, fau: 34, fal: 110, bau: 0, bal: 110 }),
  cross: P({ t: 22, h: -2, fau: 93, fal: 0, bau: 6, bal: 120, flu: 38, fll: -24, blu: -36, bll: -4, x: 14 }),
  cross_c: P({ t: 0, h: -6, fau: 20, fal: 130, bau: 10, bal: 120, flu: 18, fll: -20, blu: -18, bll: -16, x: -4 }),

  kick: P({ t: -24, h: 8, fau: 44, fal: 96, bau: -26, bal: 70, flu: 104, fll: -4, blu: -10, bll: -6 }),
  kick_c: P({ t: -10, h: 4, fau: 44, fal: 104, bau: -10, bal: 90, flu: 100, fll: -122, blu: -8, bll: -8 }),
  spin: P({ t: -30, h: 10, fau: -30, fal: 60, bau: 50, bal: 96, flu: -6, fll: -8, blu: 116, bll: -6, x: 10 }),
  spin_c: P({ t: -12, h: 4, fau: 20, fal: 90, bau: 40, bal: 110, flu: 2, fll: -10, blu: 96, bll: -118, x: 4 }),

  upper: P({ t: -14, h: -18, fau: 172, fal: 6, bau: -16, bal: 70, flu: 16, fll: -6, blu: -16, bll: -6, y: 8 }),
  upper_c: P({ t: 36, h: -16, fau: -26, fal: 34, bau: 30, bal: 112, ...CROUCH_LEGS }),
  sweep: P({ t: 34, h: -14, fau: 70, fal: 40, bau: -40, bal: 40, flu: 86, fll: -2, blu: -64, bll: -30 }),
  sweep_c: P({ t: 32, h: -16, fau: 50, fal: 80, bau: 10, bal: 100, flu: 40, fll: -100, blu: -60, bll: -32 }),

  apunch: P({ t: 18, h: 2, fau: 62, fal: 4, bau: 24, bal: 120, flu: 72, fll: -112, blu: 30, bll: -96, y: 10 }),
  apunch_c: P({ t: 10, fau: 30, fal: 110, bau: 20, bal: 120, flu: 66, fll: -106, blu: 24, bll: -92, y: 10 }),
  akick: P({ t: -16, h: 6, fau: 60, fal: 100, bau: -30, bal: 60, flu: 62, fll: -2, blu: -6, bll: -112, y: 10 }),
  akick_c: P({ t: 0, fau: 60, fal: 100, bau: 0, bal: 80, flu: 80, fll: -130, blu: 10, bll: -110, y: 10 }),

  hit_high: P({ t: -26, h: -30, fau: -18, fal: 50, bau: -30, bal: 40, flu: 30, fll: -10, blu: -26, bll: -14, x: -6 }),
  hit_low: P({ t: 38, h: 22, fau: 14, fal: 70, bau: 4, bal: 80, flu: 26, fll: -30, blu: -20, bll: -22 }),
  hit_crouch: P({ t: 10, h: -26, fau: 10, fal: 60, bau: -10, bal: 50, ...CROUCH_LEGS }),
  launched: P({ t: -34, h: -28, fau: 150, fal: 20, bau: 120, bal: 30, flu: 40, fll: -50, blu: 8, bll: -40, y: 10 }),
  falling: P({ t: -10, h: -10, fau: 120, fal: 30, bau: 100, bal: 20, flu: 30, fll: -40, blu: 10, bll: -20, y: 10, rot: -72 }),
  down: P({ t: 0, h: -6, fau: 150, fal: 20, bau: 120, bal: 40, flu: 14, fll: -18, blu: -4, bll: -6, rot: -90 }),
  rise: P({ t: 50, h: -10, fau: 60, fal: 40, bau: 30, bal: 60, flu: 90, fll: -130, blu: -60, bll: -40 }),

  dizzy: P({ t: -6, h: 18, fau: 6, fal: 22, bau: -6, bal: 18, flu: 12, fll: -10, blu: -14, bll: -8 }),
  dizzy2: P({ t: 4, h: 28, fau: 0, fal: 30, bau: 4, bal: 12, flu: 16, fll: -20, blu: -10, bll: -4 }),
  victory: P({ t: -4, h: -12, fau: 176, fal: -6, bau: -14, bal: 112, flu: 9, fll: -2, blu: -9, bll: -2 }),
  victory_c: P({ t: 12, h: 10, fau: 30, fal: 90, bau: 10, bal: 110, flu: 20, fll: -30, blu: -20, bll: -20 }),
  intro: P({ t: 0, h: 0, fau: 6, fal: 8, bau: -4, bal: 10, flu: 8, fll: -2, blu: -8, bll: -2 }),

  cast: P({ t: 18, h: -4, fau: 86, fal: 0, bau: 80, bal: 6, flu: 36, fll: -24, blu: -36, bll: -4, x: 10 }),
  cast_c: P({ t: -6, h: -4, fau: -40, fal: 110, bau: -50, bal: 100, flu: 20, fll: -26, blu: -24, bll: -12, x: -6 }),
  dash: P({ t: 44, h: -24, fau: 96, fal: 0, bau: -56, bal: 20, flu: 62, fll: -34, blu: -50, bll: -16, x: 8 }),
  slam_up: P({ t: -16, h: -14, fau: 176, fal: 18, bau: 170, bal: 24, flu: 50, fll: -80, blu: 10, bll: -70, y: 12 }),
  slam: P({ t: 46, h: -10, fau: 64, fal: 0, bau: 58, bal: 0, ...CROUCH_LEGS }),
  rising: P({ t: -22, h: -16, fau: 120, fal: 30, bau: -40, bal: 30, flu: 152, fll: -8, blu: -24, bll: -40, y: 10 }),
  rising_c: P({ t: 30, h: -10, fau: 30, fal: 100, bau: 10, bal: 110, ...CROUCH_LEGS }),
  vanish: P({ t: 20, h: 10, fau: 70, fal: 120, bau: 60, bal: 126, flu: 40, fll: -60, blu: -30, bll: -40 }),
  strike: P({ t: 18, h: -4, fau: 98, fal: 0, bau: -20, bal: 50, flu: 40, fll: -28, blu: -40, bll: -6, x: 12 }),
  exec_c: P({ t: -10, h: -20, fau: 160, fal: 30, bau: 150, bal: 30, flu: 16, fll: -20, blu: -20, bll: -10 }),
  exec: P({ t: 30, h: -6, fau: 92, fal: 0, bau: 88, bal: 4, flu: 44, fll: -36, blu: -44, bll: -4, x: 18 })
};

export function lerpPose(a, b, k, out = {}) {
  for (const key of POSE_KEYS) out[key] = a[key] + (b[key] - a[key]) * k;
  out.oy = (a.oy ?? 0) + ((b.oy ?? 0) - (a.oy ?? 0)) * k;
  return out;
}

export const ease = {
  linear: (x) => x,
  out: (x) => 1 - (1 - x) * (1 - x),
  inOut: (x) => (x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2),
  in: (x) => x * x
};

/* Keyframe track: frames = [[poseName, ticks, easeName?], ...]. The first
   frame is the start pose (ticks ignored); each following frame is reached
   after its tick count. Past the end, the last pose holds.              */
export function track(frames, t, out = {}) {
  let prev = POSES[frames[0][0]];
  let acc = 0;
  for (let i = 1; i < frames.length; i++) {
    const [name, dur, e] = frames[i];
    const next = POSES[name];
    if (t < acc + dur) {
      const k = dur > 0 ? (t - acc) / dur : 1;
      return lerpPose(prev, next, (ease[e] || ease.inOut)(clamp(k, 0, 1)), out);
    }
    acc += dur;
    prev = next;
  }
  return lerpPose(prev, prev, 0, out);
}

/* ------------------------------------------------------------------- FK */

export function scaledBody(def) {
  const s = def.scale;
  const b = def.body;
  return {
    torso: b.torso * s, neck: b.neck * s, head: b.head * s,
    upperArm: b.upperArm * s, foreArm: b.foreArm * s,
    thigh: b.thigh * s, shin: b.shin * s, foot: b.foot * s,
    bulk: b.bulk, scale: s
  };
}

const dn = (a) => [Math.sin(a), -Math.cos(a)];   // direction from "down"-based angle
const up = (a) => [Math.sin(a), Math.cos(a)];     // direction from "up"-based angle

function footAngle(shinAbs) {
  const k = clamp(Math.abs(shinAbs) / (120 * D), 0, 1);
  return shinAbs + (90 * D) * (1 - k * 0.75);
}

export const JOINTS = ['hip', 'neck', 'head', 'shF', 'shB', 'elF', 'elB', 'hf', 'hb',
  'hipF', 'hipB', 'knF', 'knB', 'anF', 'anB', 'ff', 'fb', 'heF', 'heB'];

/* Solves the skeleton for pose `p`. Returns local points (hip near origin,
   y up). `p.oy` is the hip height above the floor.                       */
export function solve(p, b, out) {
  const o = out || {};
  const tr = p.t * D;
  const [ux, uy] = up(tr);
  const hip = [0, 0];
  const neck = [ux * b.torso, uy * b.torso];
  const shoulder = [ux * b.torso * 0.86, uy * b.torso * 0.86];
  const bodyW = 5 * b.scale * b.bulk;
  const shF = [shoulder[0] + uy * bodyW * 0.6, shoulder[1] - ux * bodyW * 0.6];
  const shB = [shoulder[0] - uy * bodyW, shoulder[1] + ux * bodyW];
  const ha = tr + p.h * D;
  const [hx, hy] = up(ha);
  const head = [neck[0] + hx * (b.neck + b.head), neck[1] + hy * (b.neck + b.head)];

  const arm = (sh, ua, la) => {
    const a1 = ua * D, a2 = (ua + la) * D;
    const [ex, ey] = dn(a1), [fx, fy] = dn(a2);
    const el = [sh[0] + ex * b.upperArm, sh[1] + ey * b.upperArm];
    const hd = [el[0] + fx * b.foreArm, el[1] + fy * b.foreArm];
    return [el, hd];
  };
  const [elF, hf] = arm(shF, p.fau, p.fal);
  const [elB, hb] = arm(shB, p.bau, p.bal);

  const leg = (hp, tu, tl) => {
    const a1 = tu * D, a2 = (tu + tl) * D;
    const [kx, ky] = dn(a1), [sx, sy] = dn(a2);
    const kn = [hp[0] + kx * b.thigh, hp[1] + ky * b.thigh];
    const an = [kn[0] + sx * b.shin, kn[1] + sy * b.shin];
    const fa = footAngle(a2);
    const [fx, fy] = dn(fa);
    const toe = [an[0] + fx * b.foot, an[1] + fy * b.foot];
    const heel = [an[0] - fx * b.foot * 0.28, an[1] - fy * b.foot * 0.28];
    return [kn, an, toe, heel];
  };
  const hipF = [uy * 3 * b.scale, -ux * 3 * b.scale];
  const hipB = [-uy * 4 * b.scale, ux * 4 * b.scale];
  const [knF, anF, ff, heF] = leg(hipF, p.flu, p.fll);
  const [knB, anB, fb, heB] = leg(hipB, p.blu, p.bll);

  const pts = { hip, neck, head, shF, shB, elF, elB, hf, hb, hipF, hipB, knF, knB, anF, anB, ff, fb, heF, heB };

  // whole-body rotation about the mid torso
  if (p.rot) {
    const r = -p.rot * D;
    const cx = ux * b.torso * 0.35, cy = uy * b.torso * 0.35;
    const c = Math.cos(r), s = Math.sin(r);
    for (const k of JOINTS) {
      const q = pts[k];
      const dx = q[0] - cx, dy = q[1] - cy;
      q[0] = cx + dx * c - dy * s;
      q[1] = cy + dx * s + dy * c;
    }
  }
  for (const k of JOINTS) {
    const q = pts[k];
    const t = o[k] || (o[k] = [0, 0]);
    t[0] = q[0] + p.x;
    t[1] = q[1] + (p.oy ?? 0);
  }
  o.headR = b.head;
  o.torsoAng = tr - (p.rot || 0) * D;
  o.headAng = ha - (p.rot || 0) * D;
  return o;
}

/* Lowest point of a solved skeleton in local space, so grounded poses can
   be dropped onto the floor. Hands count (cartwheels, lying down).        */
export function groundOffset(p, b) {
  const tmp = solve({ ...p, oy: 0 }, b, {});
  let min = Infinity;
  for (const k of ['ff', 'fb', 'heF', 'heB', 'anF', 'anB']) min = Math.min(min, tmp[k][1] - 4 * b.scale);
  for (const k of ['knF', 'knB']) min = Math.min(min, tmp[k][1] - 9 * b.scale);
  for (const k of ['hf', 'hb']) min = Math.min(min, tmp[k][1] - 8 * b.scale);
  min = Math.min(min, tmp.head[1] - b.head, tmp.hip[1] - 16 * b.scale, tmp.neck[1] - 14 * b.scale);
  return -min;
}

/* Memoised per (pose object, body) -- the library poses never mutate.   */
const groundCache = new WeakMap();
export function restingHip(p, b) {
  let m = groundCache.get(b);
  if (!m) groundCache.set(b, (m = new Map()));
  let v = m.get(p);
  if (v === undefined) m.set(p, (v = groundOffset(p, b)));
  return v;
}
