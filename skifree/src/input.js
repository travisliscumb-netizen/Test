// Keyboard first (arrows or WASD, Space, F), with the original's mouse
// steering (the skier points at the cursor). On touch screens the same idea
// works with a finger: the skier heads for wherever you're touching, a quick
// swipe up or down does a trick, and HOP / TURBO are buttons.
// Produces one plain state object per frame for the simulation.

const KEYMAP = {
  ArrowLeft: 'left', KeyA: 'left',
  ArrowRight: 'right', KeyD: 'right',
  ArrowUp: 'up', KeyW: 'up',
  ArrowDown: 'down', KeyS: 'down',
  Space: 'jump',
  KeyF: 'turbo',
};

export class Input {
  constructor(target, canvas) {
    this.keys = { left: false, right: false, up: false, down: false, jump: false, turbo: false };
    this.touch = { left: false, right: false, up: false, down: false, jump: false, turbo: false };
    this.mouse = { active: false, x: 0, y: 0, down: false, moved: 0 };
    this.finger = { id: null, x: 0, y: 0, x0: 0, y0: 0, t0: 0 };
    // A tap can start and end between two frames; latch it so it still counts.
    this.jumpLatch = false;
    this.upLatch = false;
    this.downLatch = false;
    this.handlers = {}; // pause, restart, confirm, any
    this.capture = false; // true while a run is live: swallow game keys

    target.addEventListener('keydown', (e) => this.onKey(e, true));
    target.addEventListener('keyup', (e) => this.onKey(e, false));
    target.addEventListener('blur', () => this.clear());

    canvas.addEventListener('pointermove', (e) => {
      if (e.pointerType !== 'mouse') return;
      const dx = e.clientX - this.mouse.x, dy = e.clientY - this.mouse.y;
      this.mouse.x = e.clientX;
      this.mouse.y = e.clientY;
      // Tiny jitters from a resting hand shouldn't steal control from the keys.
      this.mouse.moved += Math.hypot(dx, dy);
      if (this.mouse.moved > 12) this.mouse.active = true;
    });
    canvas.addEventListener('pointerdown', (e) => {
      if (e.pointerType !== 'mouse' || e.button !== 0) return;
      this.mouse.x = e.clientX;
      this.mouse.y = e.clientY;
      this.mouse.active = true;
      this.mouse.down = true;
      this.jumpLatch = true;
      this.handlers.any?.();
    });
    const up = (e) => {
      if (e.pointerType === 'mouse') this.mouse.down = false;
    };
    canvas.addEventListener('pointerup', up);
    canvas.addEventListener('pointercancel', up);
    canvas.addEventListener('pointerleave', () => {
      this.mouse.active = false;
      this.mouse.down = false;
    });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());

    // Finger steering.
    canvas.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse' || this.finger.id !== null) return;
      e.preventDefault();
      canvas.setPointerCapture?.(e.pointerId);
      Object.assign(this.finger, { id: e.pointerId, x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY, t0: performance.now() });
      this.handlers.any?.();
    });
    canvas.addEventListener('pointermove', (e) => {
      if (e.pointerId !== this.finger.id) return;
      this.finger.x = e.clientX;
      this.finger.y = e.clientY;
    });
    const lift = (e) => {
      if (e.pointerId !== this.finger.id) return;
      const f = this.finger;
      const dx = e.clientX - f.x0, dy = e.clientY - f.y0;
      // A quick vertical flick is a trick (up = backflip, down = spread eagle).
      if (performance.now() - f.t0 < 350 && Math.abs(dy) > 45 && Math.abs(dy) > Math.abs(dx) * 1.5) {
        if (dy < 0) this.upLatch = true;
        else this.downLatch = true;
      }
      f.id = null;
    };
    canvas.addEventListener('pointerup', lift);
    canvas.addEventListener('pointercancel', lift);
  }

  on(name, fn) {
    this.handlers[name] = fn;
  }

  onKey(e, down) {
    // macOS swallows keyups while Cmd is held: drop everything when it lifts,
    // and never treat Cmd/Ctrl shortcuts as game input.
    if (!down && e.key === 'Meta') this.clear();
    if (down && (e.metaKey || e.ctrlKey)) return;
    if (e.target && /^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName)) {
      // Form controls keep their keys, except Escape still closes the panel.
      if (down && e.code === 'Escape' && !e.repeat) {
        e.target.blur();
        this.handlers.pause?.();
      }
      return;
    }
    const k = KEYMAP[e.code];
    if (down) {
      // F3 paused the original; Esc and P are the modern habits.
      if (e.code === 'Escape' || e.code === 'KeyP' || e.code === 'F3') {
        if (!e.repeat) this.handlers.pause?.();
        e.preventDefault();
        return;
      }
      // F2 restarted the original.
      if (e.code === 'F2') e.preventDefault();
      if ((e.code === 'KeyR' || e.code === 'F2') && !e.repeat && this.capture) {
        this.handlers.restart?.();
        return;
      }
      if ((e.code === 'Enter' || e.code === 'NumpadEnter') && !e.repeat) {
        if (this.handlers.confirm?.(e)) e.preventDefault();
        return;
      }
      if (!e.repeat) this.handlers.any?.(e);
    }
    if (!k) return;
    if (this.capture) e.preventDefault();
    this.keys[k] = down;
    if (down && !e.repeat) {
      if (k === 'jump') this.jumpLatch = true;
      if (k === 'up') this.upLatch = true;
      if (k === 'down') this.downLatch = true;
    }
    // Steering with keys hands control back from the mouse.
    if (down && (k === 'left' || k === 'right' || k === 'up')) {
      this.mouse.active = false;
      this.mouse.moved = 0;
    }
  }

  // Wires a DOM button that holds `key` while pressed (multi-touch safe).
  bindTouchButton(el, key) {
    const set = (v) => (e) => {
      e.preventDefault();
      this.touch[key] = v;
      if (v && key === 'jump') this.jumpLatch = true;
      el.classList.toggle('held', v);
      if (v) {
        el.setPointerCapture?.(e.pointerId);
        this.handlers.any?.();
      }
    };
    el.addEventListener('pointerdown', set(true));
    el.addEventListener('pointerup', set(false));
    el.addEventListener('pointercancel', set(false));
    el.addEventListener('lostpointercapture', () => {
      this.touch[key] = false;
      el.classList.remove('held');
    });
    el.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  clear() {
    for (const k in this.keys) this.keys[k] = false;
    for (const k in this.touch) this.touch[k] = false;
    this.mouse.down = false;
    this.jumpLatch = this.upLatch = this.downLatch = false;
    // The finger stays tracked: its pointerup/cancel still arrive after a
    // pause, and dropping it here left steering dead until a fresh touch.
    document.querySelectorAll?.('.held').forEach((el) => el.classList.remove('held'));
  }

  // aimFn(screenX, screenY) -> heading, supplied by the host (needs the camera).
  state(aimFn) {
    const k = this.keys, t = this.touch;
    const s = {
      left: k.left || t.left,
      right: k.right || t.right,
      up: k.up || t.up || this.upLatch,
      down: k.down || t.down || this.downLatch,
      jump: k.jump || t.jump || this.mouse.down || this.jumpLatch,
      turbo: k.turbo || t.turbo,
      aim: null,
    };
    if (aimFn && !s.left && !s.right) {
      if (this.finger.id !== null) s.aim = aimFn(this.finger.x, this.finger.y);
      else if (this.mouse.active) s.aim = aimFn(this.mouse.x, this.mouse.y);
    }
    this.pollGamepad(s);
    this.jumpLatch = this.upLatch = this.downLatch = false;
    return s;
  }

  // Standard-mapping gamepads: left stick or d-pad steers (analog), A hops
  // (and does the helicopter in the air), stick up/down tuck and brake (and
  // flip / spread eagle in the air), B brakes, RT or X is turbo, Start pauses.
  pollGamepad(s) {
    const pads = typeof navigator !== 'undefined' && navigator.getGamepads ? navigator.getGamepads() : [];
    let startNow = false;
    for (const pad of pads) {
      if (!pad || !pad.connected) continue;
      const b = (i) => !!(pad.buttons[i] && (pad.buttons[i].pressed || pad.buttons[i].value > 0.5));
      const x = pad.axes[0] || 0, y = pad.axes[1] || 0;
      if (Math.abs(x) > 0.2 && !s.left && !s.right) {
        // Analog: the stick sets how far across the hill to point.
        s.aim = Math.max(-1, Math.min(1, (Math.abs(x) - 0.2) / 0.75)) * Math.sign(x) * (Math.PI / 2);
      }
      if (b(14)) s.left = true;
      if (b(15)) s.right = true;
      if (b(12) || y < -0.6) s.up = true;
      if (b(13) || y > 0.6 || b(1) || b(6)) s.down = true;
      if (b(0)) s.jump = true;
      if (b(7) || b(2) || b(5)) s.turbo = true;
      if (b(9)) startNow = true;
      if (s.aim !== null || s.left || s.right) this.mouse.active = false;
    }
    if (startNow && !this.padStart) this.handlers.pause?.();
    this.padStart = startNow;
  }

  get fingerDown() {
    return this.finger.id !== null;
  }
}
