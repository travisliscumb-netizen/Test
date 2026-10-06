/* Touch-first input.

   Left thumb: a floating joystick -- centred wherever the thumb lands, so
   there is no "missing the stick". Double-flick it to dash.

   Right thumb: four buttons, and each attack button reads a GESTURE:
     tap            the basic move -- fires the instant the thumb lands
     swipe          up / down / toward / away: a different move. The swipe is
                    recognised a few frames later and the engine upgrades the
                    move in place, so gestures cost no input lag
     hold, release  a charged, guard-breaking attack (a ring fills on the button)
   Presses are latched between simulation ticks so a tap shorter than one
   frame is never lost.

   Keyboard and standard gamepads also work (desktop / controller play).  */

const DIRS = ['l', 'r', 'u', 'd'];
const BTNS = ['p', 'k', 'b', 's'];

export class Input {
  constructor({ stickZone, stickBase, stickKnob, buttons, onPress }) {
    this.touch = { l: false, r: false, u: false, d: false, p: false, k: false, b: false, s: false };
    this.keys = { l: false, r: false, u: false, d: false, p: false, k: false, b: false, s: false };
    this.pad = { l: false, r: false, u: false, d: false, p: false, k: false, b: false, s: false };
    this.latch = { p: false, k: false, s: false, u: false };
    this.mods = { p: null, k: null, s: null };
    this.upg = { p: false, k: false, s: false };   // this swipe belongs to a tap that already fired
    this.dashLatch = null;
    this.lastFlick = { l: -1e9, r: -1e9 };
    this.keyTap = { l: -1e9, r: -1e9 };
    this.keyDown = {};
    this.sizeK = 1;
    this.enabled = true;
    this.onPress = onPress || (() => {});
    this.stickZone = stickZone;
    this.stickBase = stickBase;
    this.stickKnob = stickKnob;
    this.buttons = buttons;               // [{ el, key }]
    this.stickId = null;
    this.btnPointers = new Map();          // pointerId -> key
    this.padPrev = {};
    this.bindStick();
    this.bindButtons();
    this.bindKeys();
  }

  /* ----------------------------------------------------------- stick */
  bindStick() {
    const z = this.stickZone;
    const R = () => Math.max(46, this.stickBase.offsetWidth * 0.42);
    let ox = 0, oy = 0;
    const update = (x, y, ts) => {
      let dx = x - ox, dy = y - oy;
      const r = R();
      const len = Math.hypot(dx, dy);
      if (len > r) { dx *= r / len; dy *= r / len; }
      this.stickKnob.style.transform = `translate(${dx}px, ${dy}px)`;
      const dead = r * 0.3;
      const nx = len > dead ? dx / Math.max(len, 1) : 0;
      const ny = len > dead ? dy / Math.max(len, 1) : 0;
      const prevU = this.touch.u, prevL = this.touch.l, prevR = this.touch.r;
      this.touch.l = nx < -0.42;
      this.touch.r = nx > 0.42;
      this.flick('l', prevL, this.touch.l, ts);
      this.flick('r', prevR, this.touch.r, ts);
      this.touch.u = ny < -0.62;
      this.touch.d = ny > 0.5;
      if (this.touch.u && !prevU) { this.latch.u = true; }
    };
    const release = (ts) => {
      if (this.touch.l) this.lastFlick.l = ts;
      if (this.touch.r) this.lastFlick.r = ts;
      this.stickId = null;
      for (const d of DIRS) this.touch[d] = false;
      this.stickKnob.style.transform = '';
      z.classList.remove('active');
      this.stickBase.style.left = '';
      this.stickBase.style.top = '';
    };
    z.addEventListener('pointerdown', (e) => {
      if (!this.enabled || this.stickId !== null) return;
      e.preventDefault();
      this.stickId = e.pointerId;
      try { z.setPointerCapture(e.pointerId); } catch { /* not all engines */ }
      const rect = z.getBoundingClientRect();
      ox = e.clientX; oy = e.clientY;
      this.stickBase.style.left = (ox - rect.left) + 'px';
      this.stickBase.style.top = (oy - rect.top) + 'px';
      z.classList.add('active');
      update(ox, oy, e.timeStamp);
    });
    z.addEventListener('pointermove', (e) => {
      if (e.pointerId !== this.stickId) return;
      e.preventDefault();
      update(e.clientX, e.clientY, e.timeStamp);
    });
    for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) {
      z.addEventListener(ev, (e) => { if (e.pointerId === this.stickId) release(e.timeStamp); });
    }
    this.releaseStick = () => release(-1e9);
  }

  /* a quick out-in-out on one side within 260 ms is a dash that way */
  flick(dir, was, now, t) {
    if (now && !was) {
      if (t - this.lastFlick[dir] < 260) { this.dashLatch = dir; this.lastFlick[dir] = -1e9; }
    } else if (was && !now) {
      this.lastFlick[dir] = t;
    }
  }

  /* --------------------------------------------------------- buttons */
  bindButtons() {
    const zone = this.buttons[0].el.parentElement;
    const SWIPE = 24, CHARGE_MS = 380;
    const hit = (x, y) => {
      let best = null, bd = Infinity;
      for (const b of this.buttons) {
        const r = b.el.getBoundingClientRect();
        const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
        // distance to the button's own shape, generous by 25%
        const dx = Math.max(0, Math.abs(x - cx) - r.width / 2), dy = Math.max(0, Math.abs(y - cy) - r.height / 2);
        const d = Math.hypot(dx, dy) / Math.min(r.width, r.height);
        if (d < 0.25 && d < bd) { bd = d; best = b; }
      }
      return best;
    };
    const flash = (el, cls) => {
      el.classList.remove(cls);
      void el.offsetWidth;
      el.classList.add(cls);
      setTimeout(() => el.classList.remove(cls), 260);
    };
    zone.addEventListener('pointerdown', (e) => {
      if (!this.enabled) return;
      e.preventDefault();
      const b = hit(e.clientX, e.clientY);
      if (!b) return;
      try { zone.setPointerCapture(e.pointerId); } catch { /* ignore */ }
      // e.timeStamp is when the finger actually landed, not when this handler
      // got to run -- a janky frame must never turn a tap into a charge
      const ptr = { key: b.key, el: b.el, x0: e.clientX, y0: e.clientY, t0: e.timeStamp, swiped: false };
      this.btnPointers.set(e.pointerId, ptr);
      if (b.key !== 'b') { this.latch[b.key] = true; this.mods[b.key] = null; }
      if (b.key === 'p' || b.key === 'k') {
        b.el.classList.add('charging');
        ptr.timer = setTimeout(() => { if (!ptr.swiped) b.el.classList.add('charged'); }, CHARGE_MS);
      }
      this.syncButtons();
      this.onPress(b.key);
    });
    zone.addEventListener('pointermove', (e) => {
      const ptr = this.btnPointers.get(e.pointerId);
      if (!ptr || ptr.swiped || ptr.key === 'b' || !this.enabled) return;
      const dx = e.clientX - ptr.x0, dy = e.clientY - ptr.y0;
      if (Math.hypot(dx, dy) < SWIPE * this.sizeK) return;
      ptr.swiped = true;
      const dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'r' : 'l') : (dy > 0 ? 'd' : 'u');
      this.latch[ptr.key] = true;
      this.mods[ptr.key] = dir;
      // judged by finger time, so a slow frame can never make a swipe "late"
      this.upg[ptr.key] = ptr.key !== 'b' && e.timeStamp - ptr.t0 < 150;
      clearTimeout(ptr.timer);
      ptr.el.classList.remove('charging', 'charged');
      flash(ptr.el, 'swipe-' + dir);
      this.onPress(ptr.key);
    });
    const end = (e) => {
      const ptr = this.btnPointers.get(e.pointerId);
      if (!ptr) return;
      clearTimeout(ptr.timer);
      if ((ptr.key === 'p' || ptr.key === 'k') && !ptr.swiped && e.timeStamp - ptr.t0 >= CHARGE_MS && this.enabled) {
        this.latch[ptr.key] = true;                 // the charged release
        this.mods[ptr.key] = 'c';
        flash(ptr.el, 'release');
        this.onPress(ptr.key);
      }
      ptr.el.classList.remove('charging', 'charged');
      this.btnPointers.delete(e.pointerId);
      this.syncButtons();
    };
    for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) zone.addEventListener(ev, end);
  }

  syncButtons() {
    const held = new Set([...this.btnPointers.values()].map((p) => p.key));
    for (const b of this.buttons) {
      this.touch[b.key] = held.has(b.key);
      b.el.classList.toggle('down', held.has(b.key));
    }
  }

  /* ------------------------------------------------------- keyboard */
  bindKeys() {
    const map = {
      ArrowLeft: 'l', KeyA: 'l', ArrowRight: 'r', KeyD: 'r', ArrowUp: 'u', KeyW: 'u', ArrowDown: 'd', KeyS: 'd',
      KeyJ: 'p', KeyK: 'k', KeyL: 'b', ShiftLeft: 'b', KeyI: 's', Space: 's'
    };
    // gesture shortcuts: U / O = punch / kick toward the foe, Y = up-special, H = forward-special
    const gest = { KeyU: ['p', 'f'], KeyO: ['k', 'f'], KeyY: ['s', 'u'], KeyH: ['s', 'f'] };
    window.addEventListener('keydown', (e) => {
      if (gest[e.code]) {
        e.preventDefault();
        if (!e.repeat) { const [k, m] = gest[e.code]; this.latch[k] = true; this.mods[k] = m; }
        return;
      }
      const k = map[e.code];
      if (!k) return;
      e.preventDefault();
      if (!e.repeat) {
        if (k in this.latch) { this.latch[k] = true; if (k in this.mods) this.mods[k] = null; }
        if (k === 'l' || k === 'r') {
          const now = performance.now();
          if (e.timeStamp - this.keyTap[k] < 260) this.dashLatch = k;
          this.keyTap[k] = e.timeStamp;
        }
        this.keyDown[k] = e.timeStamp;
      }
      this.keys[k] = true;
    });
    window.addEventListener('keyup', (e) => {
      const k = map[e.code];
      if (!k) return;
      this.keys[k] = false;
      if ((k === 'p' || k === 'k') && e.timeStamp - (this.keyDown[k] || 0) >= 380) {
        this.latch[k] = true;                       // held and released: charged
        this.mods[k] = 'c';
      }
    });
    window.addEventListener('blur', () => this.clear());
  }

  pollPad() {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    const gp = pads && [...pads].find((p) => p && p.connected);
    const P = this.pad;
    if (!gp) { for (const k in P) P[k] = false; return; }
    const b = (i) => !!(gp.buttons[i] && gp.buttons[i].pressed);
    const ax = gp.axes[0] || 0, ay = gp.axes[1] || 0;
    P.l = b(14) || ax < -0.45; P.r = b(15) || ax > 0.45;
    P.u = b(12) || ay < -0.6; P.d = b(13) || ay > 0.5;
    P.p = b(2); P.k = b(0); P.b = b(1) || b(5) || b(4); P.s = b(3) || b(7);
    for (const k of ['p', 'k', 's', 'u']) {
      if (P[k] && !this.padPrev[k]) this.latch[k] = true;
      this.padPrev[k] = P[k];
    }
  }

  clear() {
    for (const k in this.keys) this.keys[k] = false;
    for (const k in this.touch) this.touch[k] = false;
    for (const k in this.latch) this.latch[k] = false;
    for (const k in this.mods) this.mods[k] = null;
    for (const k in this.upg) this.upg[k] = false;
    this.dashLatch = null;
    for (const p of this.btnPointers.values()) { clearTimeout(p.timer); p.el.classList.remove('charging', 'charged'); }
    this.btnPointers.clear();
    for (const b of this.buttons) b.el.classList.remove('down');
    if (this.releaseStick) this.releaseStick();
  }

  /* One sample per simulation tick. Latched presses are consumed here. */
  sample(out) {
    this.pollPad();
    for (const k of [...DIRS, ...BTNS]) out.held[k] = this.touch[k] || this.keys[k] || this.pad[k];
    // left and right together cancel out
    if (out.held.l && out.held.r) out.held.l = out.held.r = false;
    for (const k in this.latch) { out.pressed[k] = this.latch[k]; this.latch[k] = false; }
    if (!out.mods) out.mods = { p: null, k: null, s: null };
    for (const k in this.mods) { out.mods[k] = this.mods[k]; this.mods[k] = null; }
    if (!out.upg) out.upg = { p: false, k: false, s: false };
    for (const k in this.upg) { out.upg[k] = this.upg[k]; this.upg[k] = false; }
    out.dash = this.dashLatch;
    this.dashLatch = null;
    if (!this.enabled) {
      for (const k in out.held) out.held[k] = false;
      for (const k in out.pressed) out.pressed[k] = false;
      out.dash = null;
    }
    return out;
  }
}
