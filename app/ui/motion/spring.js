/**
 * Spring physics.
 *
 * Durations describe how long something takes; springs describe how something
 * behaves. That difference matters here because almost every motion in this
 * app is interruptible — a card is being dragged when the route reorders, a
 * sheet is half-open when a stop completes — and a duration-based tween that
 * is interrupted has to either snap or restart. A spring carries its velocity
 * across the interruption and simply continues, which is what makes the
 * interface feel like it is made of objects rather than of states.
 *
 * The integrator is a fixed-step semi-implicit Euler at 1/240 s, sub-stepped
 * under the frame. That is stable at the stiffnesses used here, deterministic
 * regardless of frame rate, and far cheaper than solving the closed form every
 * frame for the critically-damped and near-critically-damped cases.
 */

export const SPRING = {
  /** Buttons, toggles, taps. Fast, no perceptible overshoot. */
  snap: { stiffness: 520, damping: 34, mass: 1 },
  /** Cards moving to a new position. Slight, confident overshoot. */
  glide: { stiffness: 300, damping: 26, mass: 1 },
  /** Sheets and large surfaces. Heavier, settles smoothly. */
  settle: { stiffness: 210, damping: 24, mass: 1.1 },
  /** Lift/drop of a dragged row. */
  lift: { stiffness: 440, damping: 25, mass: 1 },
  /** Map camera. Deliberately slow — a fast camera is disorienting. */
  camera: { stiffness: 130, damping: 21, mass: 1 },
  /** Counters and numeric readouts. */
  count: { stiffness: 170, damping: 26, mass: 1 },
};

const STEP = 1 / 240;
const REST_V = 0.02;
const REST_X = 0.004;

export class Spring {
  constructor(value = 0, config = SPRING.glide) {
    this.value = value;
    this.target = value;
    this.velocity = 0;
    this.config = config;
    this.resting = true;
  }

  set(config) { this.config = config; return this; }

  /** Retargets without discarding momentum — the interruption case. */
  to(target, velocity) {
    this.target = target;
    if (Number.isFinite(velocity)) this.velocity = velocity;
    this.resting = false;
    return this;
  }

  /** Teleports. Used when the underlying data changed, not the presentation. */
  jump(value) {
    this.value = this.target = value;
    this.velocity = 0;
    this.resting = true;
    return this;
  }

  /** Advances by `dt` seconds. Returns true while still moving. */
  advance(dt) {
    if (this.resting) return false;
    const { stiffness: k, damping: c, mass: m } = this.config;
    // Clamp the frame delta: a backgrounded tab returning with dt = 4s must not
    // integrate 4 seconds of spring in one go and fling the value to infinity.
    let remaining = Math.min(dt, 0.064);
    while (remaining > 0) {
      const h = Math.min(STEP, remaining);
      const a = (-k * (this.value - this.target) - c * this.velocity) / m;
      this.velocity += a * h;
      this.value += this.velocity * h;
      remaining -= h;
    }
    if (Math.abs(this.velocity) < REST_V && Math.abs(this.value - this.target) < REST_X) {
      this.value = this.target;
      this.velocity = 0;
      this.resting = true;
      return false;
    }
    return true;
  }
}

/**
 * One shared rAF loop for every spring in the app.
 *
 * Each independent rAF callback costs a scheduling slot and its own layout
 * read/write; on a phone with a map, a list and a sheet all animating that is
 * how a 60 fps interface becomes a 40 fps one. Everything ticks here instead.
 */
class Ticker {
  constructor() {
    this.subs = new Set();
    this.raf = 0;
    this.last = 0;
    this._tick = this._tick.bind(this);
  }
  add(fn) {
    this.subs.add(fn);
    if (!this.raf) { this.last = performance.now(); this.raf = requestAnimationFrame(this._tick); }
    return () => this.remove(fn);
  }
  remove(fn) { this.subs.delete(fn); }
  _tick(now) {
    const dt = Math.min(0.064, (now - this.last) / 1000) || 0.016;
    this.last = now;
    for (const fn of [...this.subs]) {
      try { if (fn(dt, now) === false) this.subs.delete(fn); }
      catch (e) { this.subs.delete(fn); console.error('[motion]', e); }
    }
    this.raf = this.subs.size ? requestAnimationFrame(this._tick) : 0;
  }
}
export const ticker = new Ticker();

/** Animates a spring and calls `onFrame(value)`; resolves when it rests. */
export function animateSpring(spring, target, onFrame, config) {
  if (config) spring.set(config);
  spring.to(target);
  return new Promise((resolve) => {
    ticker.add((dt) => {
      const moving = spring.advance(dt);
      onFrame(spring.value, spring.velocity);
      if (!moving) { resolve(); return false; }
      return true;
    });
  });
}

/**
 * Animates a number readout. Digits that count are read as change; digits that
 * jump are read as a glitch, so every figure on the deck routes through here.
 */
export function animateNumber(from, to, onFrame, config = SPRING.count) {
  const s = new Spring(from, config);
  return animateSpring(s, to, onFrame);
}

/** Reduced motion, from the OS or the app's own setting. */
export function prefersCalm() {
  return document.documentElement.dataset.motion === 'calm';
}

export function syncMotionPreference(setting) {
  const os = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
  const calm = setting === 'calm' || os;
  document.documentElement.dataset.motion = calm ? 'calm' : 'full';
  return calm;
}
