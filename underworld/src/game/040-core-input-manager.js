/* =====================================================================
   [CORE] INPUT MANAGER  (keyboard + mouse + touch + gamepad)
   ===================================================================== */
const KEYMAP = {
  KeyW: 'up', ArrowUp: 'up', KeyS: 'down', ArrowDown: 'down', KeyA: 'left', ArrowLeft: 'left', KeyD: 'right', ArrowRight: 'right',
  ShiftLeft: 'sprint', ShiftRight: 'sprint', ControlLeft: 'walk', AltLeft: 'walk', Space: 'jump', KeyE: 'interact', KeyF: 'interact',
  KeyH: 'horn', KeyR: 'radio', KeyC: 'camera', KeyM: 'map', Escape: 'pause', KeyP: 'pause', KeyQ: 'weapon',
  Digit1: 'w1', Digit2: 'w2', Digit3: 'w3', Digit4: 'w4', Digit5: 'w5', Backquote: 'debug', F3: 'debug', KeyG: 'attack2',
  KeyV: 'kick', KeyX: 'dodge', Tab: 'empire', KeyI: 'empire', KeyB: 'lookback', F5: 'quicksave', KeyT: 'overlay'
};
class InputManager {
  constructor(canvas) {
    this.canvas = canvas;
    this.down = new Set();
    this.pressedSet = new Set();
    this.lookX = 0; this.lookY = 0;
    this.wheel = 0;
    this.stick = { x: 0, y: 0, active: false, id: null, ox: 0, oy: 0 };
    this.lookTouch = { id: null, x: 0, y: 0 };
    this.touchActs = new Map(); // touch id -> act
    this.btnLook = new Map(); // touch id -> last position, for buttons that also steer the camera
    this.toggles = new Set();
    this.locked = false;
    this.lastLookInput = 0;
    this.gp = { x: 0, y: 0, lx: 0, ly: 0, rt: 0, lt: 0, prev: [] };
    this.usingTouch = IS_TOUCH;
    this.enabled = true;
    this._bind();
  }
  _bind() {
    window.addEventListener('keydown', e => {
      const a = KEYMAP[e.code];
      if (!a) return;
      // typing in a text field (map search) is not game input; Escape still closes things
      const tg = e.target; if (tg && (tg.tagName === 'INPUT' || tg.tagName === 'TEXTAREA') && e.code !== 'Escape') return;
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'F3', 'Backquote', 'Tab', 'F5'].includes(e.code)) e.preventDefault();
      if (!this.down.has(a)) this.pressedSet.add(a);
      this.down.add(a);
      this.usingTouch = false;
    });
    window.addEventListener('keyup', e => { const a = KEYMAP[e.code]; if (a) this.down.delete(a); });
    window.addEventListener('blur', () => { this.down.clear(); });
    this.canvas.addEventListener('mousedown', e => {
      if (this.usingTouch && e.sourceCapabilities && e.sourceCapabilities.firesTouchEvents) return;
      this.usingTouch = false;
      this.dragging = true;
      const now = performance.now();
      if (this.wantLock && !this.locked && this.canvas.requestPointerLock && now - (this.lastLockTry || 0) > 1500) {
        // first click captures the mouse; if capture is refused, drag-to-look keeps working
        this.lastLockTry = now;
        try { const p = this.canvas.requestPointerLock(); if (p && p.catch) p.catch(() => {}); } catch { /* refused */ }
        return;
      }
      if (e.button === 0) { this.down.add('attack'); this.pressedSet.add('attack'); }
      if (e.button === 2) { this.down.add('aim'); this.pressedSet.add('aim'); }
    });
    window.addEventListener('mouseup', e => {
      this.dragging = false;
      if (e.button === 0) this.down.delete('attack');
      if (e.button === 2) this.down.delete('aim');
    });
    this.canvas.addEventListener('contextmenu', e => e.preventDefault());
    window.addEventListener('mousemove', e => {
      if (this.locked || (this.dragging && this.wantLock && !this.usingTouch)) { this.lookX += e.movementX || 0; this.lookY += e.movementY || 0; this.lastLookInput = performance.now(); }
    });
    window.addEventListener('wheel', e => { this.wheel += Math.sign(e.deltaY); }, { passive: true });
    document.addEventListener('pointerlockchange', () => {
      const was = this.locked;
      this.locked = document.pointerLockElement === this.canvas;
      if (was && !this.locked && this.onLockLost) this.onLockLost();
    });
    // touch
    const tl = document.getElementById('touch');
    tl.querySelectorAll('.tbtn').forEach(btn => {
      const act = btn.dataset.act;
      btn.addEventListener('touchstart', e => {
        e.preventDefault(); e.stopPropagation();
        this.usingTouch = true;
        if (btn.dataset.toggle) {
          if (this.toggles.has(act)) { this.toggles.delete(act); btn.classList.remove('on'); }
          else { this.toggles.add(act); btn.classList.add('on'); }
          this.pressedSet.add(act);
          return;
        }
        for (const t of e.changedTouches) { this.touchActs.set(t.identifier, act); if (btn.dataset.look) this.btnLook.set(t.identifier, { x: t.clientX, y: t.clientY }); }
        this.down.add(act); this.pressedSet.add(act); btn.classList.add('on');
      }, { passive: false });
      // the fire button doubles as an aim pad: drag while holding it to steer the crosshair
      // (two-thumb players fire and aim with one thumb; three-finger players use the look zone)
      if (btn.dataset.look) btn.addEventListener('touchmove', e => {
        e.preventDefault();
        for (const t of e.changedTouches) {
          const q = this.btnLook.get(t.identifier); if (!q) continue;
          this.lookX += (t.clientX - q.x) * 2.2; this.lookY += (t.clientY - q.y) * 2.2;
          q.x = t.clientX; q.y = t.clientY; this.lastLookInput = performance.now();
        }
      }, { passive: false });
      const end = e => {
        e.preventDefault();
        for (const t of e.changedTouches) { this.touchActs.delete(t.identifier); this.btnLook.delete(t.identifier); }
        let still = false; for (const v of this.touchActs.values()) if (v === act) still = true;
        if (!still && !btn.dataset.toggle) { this.down.delete(act); btn.classList.remove('on'); }
      };
      btn.addEventListener('touchend', end, { passive: false });
      btn.addEventListener('touchcancel', end, { passive: false });
    });
    const sb = document.getElementById('stickBase'), sk = document.getElementById('stickKnob');
    this._stickEls = { sb, sk };
    this.canvas.addEventListener('touchstart', e => {
      e.preventDefault();
      this.usingTouch = true;
      for (const t of e.changedTouches) {
        if (t.clientX < window.innerWidth * 0.45 && this.stick.id === null) {
          this.stick.id = t.identifier; this.stick.ox = t.clientX; this.stick.oy = t.clientY; this.stick.active = true;
          this.stick.x = 0; this.stick.y = 0;
          sb.style.left = t.clientX + 'px'; sb.style.top = t.clientY + 'px'; sb.style.opacity = 1;
          sk.style.transform = 'translate(0,0)';
        } else if (this.lookTouch.id === null) {
          this.lookTouch.id = t.identifier; this.lookTouch.x = t.clientX; this.lookTouch.y = t.clientY;
        }
      }
    }, { passive: false });
    this.canvas.addEventListener('touchmove', e => {
      e.preventDefault();
      for (const t of e.changedTouches) {
        if (t.identifier === this.stick.id) {
          let dx = t.clientX - this.stick.ox, dy = t.clientY - this.stick.oy;
          const R = 55, l = Math.hypot(dx, dy);
          if (l > R) { dx *= R / l; dy *= R / l; }
          this.stick.x = dx / R; this.stick.y = -dy / R;
          sk.style.transform = `translate(${dx}px,${dy}px)`;
        } else if (t.identifier === this.lookTouch.id) {
          this.lookX += (t.clientX - this.lookTouch.x) * 2.2;
          this.lookY += (t.clientY - this.lookTouch.y) * 2.2;
          this.lookTouch.x = t.clientX; this.lookTouch.y = t.clientY;
          this.lastLookInput = performance.now();
        }
      }
    }, { passive: false });
    const tend = e => {
      for (const t of e.changedTouches) {
        if (t.identifier === this.stick.id) { this.stick.id = null; this.stick.active = false; this.stick.x = 0; this.stick.y = 0; sb.style.opacity = 0; }
        if (t.identifier === this.lookTouch.id) this.lookTouch.id = null;
      }
    };
    this.canvas.addEventListener('touchend', tend, { passive: false });
    this.canvas.addEventListener('touchcancel', tend, { passive: false });
  }
  pollGamepad() {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    const g = pads && Array.from(pads).find(p => p && p.connected);
    if (!g) { this.gp.active = false; return; }
    const dz = v => Math.abs(v) < 0.15 ? 0 : v;
    this.gp.active = true;
    this.gp.lx = dz(g.axes[0] || 0); this.gp.ly = -dz(g.axes[1] || 0);
    const rx = dz(g.axes[2] || 0), ry = dz(g.axes[3] || 0);
    if (rx || ry) { this.lookX += rx * 14; this.lookY += ry * 10; this.lastLookInput = performance.now(); }
    const b = i => g.buttons[i] && g.buttons[i].pressed;
    this.gp.rt = g.buttons[7] ? g.buttons[7].value : 0;
    this.gp.lt = g.buttons[6] ? g.buttons[6].value : 0;
    const map = { 0: 'jump', 1: 'interact', 3: 'interact', 2: 'attack', 4: 'weapon', 5: 'aim', 9: 'pause', 8: 'map', 10: 'sprint', 11: 'camera', 12: 'horn', 13: 'radio' };
    for (const k in map) {
      const was = this.gp.prev[k], now = b(+k);
      if (now && !was) { this.pressedSet.add(map[k]); this.down.add(map[k]); this.usingTouch = false; }
      if (!now && was) this.down.delete(map[k]);
      this.gp.prev[k] = now;
    }
  }
  isDown(a) { return this.enabled && (this.down.has(a) || this.toggles.has(a)); }
  clearToggle(a) { if (!this.toggles.has(a)) return; this.toggles.delete(a); document.querySelectorAll(`#touch .tbtn[data-act="${a}"][data-toggle]`).forEach(b => b.classList.remove('on')); }
  pressed(a) { return this.enabled && this.pressedSet.has(a); }
  moveAxis() {
    let x = 0, y = 0;
    if (this.down.has('left')) x -= 1; if (this.down.has('right')) x += 1;
    if (this.down.has('up')) y += 1; if (this.down.has('down')) y -= 1;
    if (this.stick.active) { x += this.stick.x; y += this.stick.y; }
    if (this.gp.active) { x += this.gp.lx; y += this.gp.ly; }
    const l = Math.hypot(x, y);
    if (l > 1) { x /= l; y /= l; }
    return { x, y, mag: Math.min(1, l) };
  }
  consumeLook() { const r = { x: this.lookX, y: this.lookY }; this.lookX = 0; this.lookY = 0; return r; }
  endFrame() { this.pressedSet.clear(); this.wheel = 0; }
  releaseAll() {
    this.down.clear(); this.toggles.clear(); this.touchActs.clear(); this.btnLook.clear();
    document.querySelectorAll('#touch .tbtn.on').forEach(b => b.classList.remove('on'));
    this.stick.id = null; this.stick.active = false; this.stick.x = this.stick.y = 0; this.lookTouch.id = null;
    if (this._stickEls) this._stickEls.sb.style.opacity = 0;
  }
}

