/* Input: keyboard, swipe anywhere on the board, an analogue-feel D-pad, and
   gamepads. Every source reduces to "the direction the player wants"; the
   engine keeps steering toward it until a new one arrives, which is how the
   arcade joystick behaves. */

import { DIR } from './engine.js';

const KEY_DIR = {
  ArrowUp: DIR.UP, KeyW: DIR.UP,
  ArrowLeft: DIR.LEFT, KeyA: DIR.LEFT,
  ArrowDown: DIR.DOWN, KeyS: DIR.DOWN,
  ArrowRight: DIR.RIGHT, KeyD: DIR.RIGHT
};

const SWIPE_PX = 14;

function angleDir(dx, dy) {
  return Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? DIR.LEFT : DIR.RIGHT) : (dy < 0 ? DIR.UP : DIR.DOWN);
}

export class Input {
  constructor({ surface, dpad, onDir, onCommand }) {
    this.onDir = onDir;
    this.onCommand = onCommand;
    this.dpad = dpad;
    this.padDir = -1;
    this.gpPrev = { dir: -1, start: false, a: false, b: false };

    window.addEventListener('keydown', (e) => this.key(e));

    /* Swipe: a pointer on the board emits a direction each time it has
       travelled far enough, so one continuous drag can steer through several
       corners without lifting. */
    let swipe = null;
    surface.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      swipe = { id: e.pointerId, x: e.clientX, y: e.clientY };
      this.onCommand('gesture');
    }, { passive: true });
    surface.addEventListener('pointermove', (e) => {
      if (!swipe || e.pointerId !== swipe.id) return;
      const dx = e.clientX - swipe.x, dy = e.clientY - swipe.y;
      if (Math.hypot(dx, dy) < SWIPE_PX) return;
      this.onDir(angleDir(dx, dy), 'swipe');
      swipe.x = e.clientX;
      swipe.y = e.clientY;
    }, { passive: true });
    const end = (e) => { if (swipe && e.pointerId === swipe.id) swipe = null; };
    surface.addEventListener('pointerup', end, { passive: true });
    surface.addEventListener('pointercancel', end, { passive: true });

    /* D-pad: direction from the thumb's angle around the pad centre, with a
       small dead zone, so sliding the thumb round the ring turns smoothly. */
    if (dpad) {
      const nub = dpad.querySelector('.dpad-nub');
      const update = (e) => {
        const r = dpad.getBoundingClientRect();
        const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
        const dx = e.clientX - cx, dy = e.clientY - cy;
        const max = r.width * 0.3;
        const len = Math.hypot(dx, dy);
        const k = len > max ? max / len : 1;
        if (nub) nub.style.transform = `translate(calc(-50% + ${dx * k}px), calc(-50% + ${dy * k}px))`;
        if (len < r.width * 0.09) return;
        const d = angleDir(dx, dy);
        if (d !== this.padDir) {
          this.padDir = d;
          dpad.dataset.dir = String(d);
          this.onDir(d, 'dpad');
        }
      };
      let active = null;
      dpad.addEventListener('pointerdown', (e) => {
        active = e.pointerId;
        dpad.setPointerCapture(e.pointerId);
        dpad.classList.add('active');
        this.onCommand('gesture');
        update(e);
        e.preventDefault();
      });
      dpad.addEventListener('pointermove', (e) => { if (e.pointerId === active) update(e); });
      const release = (e) => {
        if (e.pointerId !== active) return;
        active = null;
        this.padDir = -1;
        delete dpad.dataset.dir;
        dpad.classList.remove('active');
        if (nub) nub.style.transform = '';
      };
      dpad.addEventListener('pointerup', release);
      dpad.addEventListener('pointercancel', release);
      dpad.addEventListener('lostpointercapture', release);
    }
  }

  key(e) {
    /* Only text entry swallows shortcuts; switches and sliders must not. */
    const t = e.target;
    if (t && (t.tagName === 'TEXTAREA' || (t.tagName === 'INPUT' && (t.type === 'text' || t.type === 'search' || !t.type)))) {
      if (e.code === 'Escape') t.blur();
      return;
    }
    this.onCommand('gesture');
    const d = KEY_DIR[e.code];
    if (d !== undefined) {
      if (this.onDir(d, 'key') !== false) e.preventDefault();
      return;
    }
    const map = { KeyP: 'pause', Escape: 'back', KeyM: 'mute', Enter: 'confirm', Space: 'confirm' };
    const cmd = map[e.code];
    if (cmd && this.onCommand(cmd, { key: true }) !== false) e.preventDefault();
  }

  /* Gamepads have no events for buttons or sticks, so they are polled. */
  pollGamepads() {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    let dir = -1, start = false, a = false, b = false;
    for (const gp of pads) {
      if (!gp) continue;
      const btn = (i) => !!(gp.buttons[i] && gp.buttons[i].pressed);
      if (btn(12)) dir = DIR.UP;
      else if (btn(13)) dir = DIR.DOWN;
      else if (btn(14)) dir = DIR.LEFT;
      else if (btn(15)) dir = DIR.RIGHT;
      else {
        const x = gp.axes[0] || 0, y = gp.axes[1] || 0;
        if (Math.hypot(x, y) > 0.5) dir = angleDir(x, y);
      }
      start = start || btn(9);
      a = a || btn(0);
      b = b || btn(1);
    }
    const p = this.gpPrev;
    if (dir >= 0 && dir !== p.dir) { this.onCommand('gesture'); this.onDir(dir, 'pad'); }
    if (start && !p.start) this.onCommand('pause');
    if (a && !p.a) this.onCommand('confirm', { pad: true });
    if (b && !p.b) this.onCommand('back');
    this.gpPrev = { dir, start, a, b };
  }
}
