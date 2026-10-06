/* Touch-first input.

   Left thumb: a floating joystick -- it is centred wherever the thumb lands
   in the left zone, so there is no "missing the stick". Right thumb: four
   buttons that are hit-tested on every move, so a thumb can roll from
   PUNCH to KICK without lifting. Presses are latched between simulation
   ticks so a tap shorter than one frame is never lost.

   Keyboard and standard gamepads also work (desktop / controller play).  */

const DIRS = ['l', 'r', 'u', 'd'];
const BTNS = ['p', 'k', 'b', 's'];

export class Input {
  constructor({ stickZone, stickBase, stickKnob, buttons, onPress }) {
    this.touch = { l: false, r: false, u: false, d: false, p: false, k: false, b: false, s: false };
    this.keys = { l: false, r: false, u: false, d: false, p: false, k: false, b: false, s: false };
    this.pad = { l: false, r: false, u: false, d: false, p: false, k: false, b: false, s: false };
    this.latch = { p: false, k: false, s: false, u: false };
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
    const update = (x, y) => {
      let dx = x - ox, dy = y - oy;
      const r = R();
      const len = Math.hypot(dx, dy);
      if (len > r) { dx *= r / len; dy *= r / len; }
      this.stickKnob.style.transform = `translate(${dx}px, ${dy}px)`;
      const dead = r * 0.3;
      const nx = len > dead ? dx / Math.max(len, 1) : 0;
      const ny = len > dead ? dy / Math.max(len, 1) : 0;
      const prevU = this.touch.u;
      this.touch.l = nx < -0.42;
      this.touch.r = nx > 0.42;
      this.touch.u = ny < -0.62;
      this.touch.d = ny > 0.5;
      if (this.touch.u && !prevU) { this.latch.u = true; }
    };
    const release = () => {
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
      update(ox, oy);
    });
    z.addEventListener('pointermove', (e) => {
      if (e.pointerId !== this.stickId) return;
      e.preventDefault();
      update(e.clientX, e.clientY);
    });
    for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) {
      z.addEventListener(ev, (e) => { if (e.pointerId === this.stickId) release(); });
    }
    this.releaseStick = release;
  }

  /* --------------------------------------------------------- buttons */
  bindButtons() {
    const zone = this.buttons[0].el.parentElement;
    const hit = (x, y) => {
      let best = null, bd = Infinity;
      for (const b of this.buttons) {
        const r = b.el.getBoundingClientRect();
        const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
        const d = Math.hypot(x - cx, y - cy);
        // generous: the touch target is 1.25x the drawn button
        if (d < r.width * 0.62 && d < bd) { bd = d; best = b.key; }
      }
      return best;
    };
    const set = (id, key) => {
      const prev = this.btnPointers.get(id);
      if (prev === key) return;
      if (key) this.btnPointers.set(id, key); else this.btnPointers.delete(id);
      this.syncButtons();
      if (key && key !== prev) {
        if (key !== 'b') this.latch[key] = true;
        this.onPress(key);
      }
    };
    zone.addEventListener('pointerdown', (e) => {
      if (!this.enabled) return;
      e.preventDefault();
      try { zone.setPointerCapture(e.pointerId); } catch { /* ignore */ }
      set(e.pointerId, hit(e.clientX, e.clientY));
    });
    zone.addEventListener('pointermove', (e) => {
      if (!this.btnPointers.has(e.pointerId) && e.pointerType === 'mouse' && !e.buttons) return;
      if (!this.enabled) return;
      const k = hit(e.clientX, e.clientY);
      if (k || this.btnPointers.has(e.pointerId)) set(e.pointerId, k);
    });
    for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) {
      zone.addEventListener(ev, (e) => set(e.pointerId, null));
    }
  }

  syncButtons() {
    const held = new Set(this.btnPointers.values());
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
    window.addEventListener('keydown', (e) => {
      const k = map[e.code];
      if (!k) return;
      e.preventDefault();
      if (!e.repeat && (k in this.latch)) this.latch[k] = true;
      this.keys[k] = true;
    });
    window.addEventListener('keyup', (e) => {
      const k = map[e.code];
      if (k) this.keys[k] = false;
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
    if (!this.enabled) {
      for (const k in out.held) out.held[k] = false;
      for (const k in out.pressed) out.pressed[k] = false;
    }
    return out;
  }
}
