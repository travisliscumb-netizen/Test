// Keyboard first (arrows or WASD, Space, F), with the original's mouse
// steering (the skier points at the cursor) and on-screen touch buttons.
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
  }

  on(name, fn) {
    this.handlers[name] = fn;
  }

  onKey(e, down) {
    if (e.target && /^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName)) return;
    const k = KEYMAP[e.code];
    if (down) {
      if (e.code === 'Escape' || e.code === 'KeyP') {
        if (!e.repeat) this.handlers.pause?.();
        e.preventDefault();
        return;
      }
      if (e.code === 'KeyR' && !e.repeat && this.capture) {
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
    document.querySelectorAll?.('.held').forEach((el) => el.classList.remove('held'));
  }

  // aimFn(screenX, screenY) -> heading, supplied by the host (needs the camera).
  state(aimFn) {
    const k = this.keys, t = this.touch;
    const s = {
      left: k.left || t.left,
      right: k.right || t.right,
      up: k.up || t.up,
      down: k.down || t.down,
      jump: k.jump || t.jump || this.mouse.down,
      turbo: k.turbo || t.turbo,
      aim: null,
    };
    if (this.mouse.active && !s.left && !s.right && aimFn) s.aim = aimFn(this.mouse.x, this.mouse.y);
    return s;
  }
}
