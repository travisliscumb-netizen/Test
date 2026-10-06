/* The "Drew edition". Only active in the build made with
   `npm run single -- --drew`, which sets window.__DREW__.

   During play, DREW SUCKS sits on the well's back wall at a whisper of
   opacity. Win the game and it turns solid, explodes, a confetti storm
   covers the screen, and when it clears: GOOD JOB, DREW. */

export const MESSAGE = ['DREW', 'SUCKS'];
export const enabled = () => typeof window !== 'undefined' && !!window.__DREW__;

/* Opacity per level, exactly as asked: none on level 1, then 0.1% per level
   (0.2% on level 2, 0.3% on level 3 ... 2.0% on level 20). */
export function messageAlpha(level) {
  if (level <= 1) return 0;
  return Math.min(level, 20) / 1000;
}

const PALETTE = ['#21e5f0', '#2f6bff', '#ff8a1f', '#ffd81f', '#3dff6e', '#b44bff', '#ff2d55', '#ffffff'];

/* Full-screen confetti on a 2D canvas: a burst from `origin`, then a steady
   rain from the top so the whole screen is covered, then everything falls
   away. Resolves when the last piece has left the screen. */
function confetti(canvas, origin, { rainMs = 3200 } = {}) {
  return new Promise((resolve) => {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const W = window.innerWidth, H = window.innerHeight;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    const g = canvas.getContext('2d');
    g.scale(dpr, dpr);
    const bits = [];
    const add = (x, y, vx, vy) => bits.push({
      x, y, vx, vy,
      w: 8 + Math.random() * 10, h: 12 + Math.random() * 16,
      rot: Math.random() * Math.PI * 2, vr: (Math.random() - 0.5) * 14,
      wob: Math.random() * Math.PI * 2, color: PALETTE[(Math.random() * PALETTE.length) | 0]
    });
    // The explosion: a dense radial burst.
    for (let i = 0; i < 1100; i++) {
      const a = Math.random() * Math.PI * 2, s = 300 + Math.random() * 1300;
      add(origin.x, origin.y, Math.cos(a) * s, Math.sin(a) * s - 300);
    }
    let last = performance.now(), elapsed = 0, rainAcc = 0;
    const step = (now) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      elapsed += dt * 1000;
      if (elapsed < rainMs) {
        rainAcc += dt * 950 * (W / 400);   // heavy enough to blanket the screen
        for (; rainAcc >= 1; rainAcc--) add(Math.random() * W, -20, (Math.random() - 0.5) * 120, 80 + Math.random() * 220);
      }
      g.clearRect(0, 0, W, H);
      for (let i = bits.length - 1; i >= 0; i--) {
        const b = bits[i];
        b.vx *= Math.exp(-1.6 * dt);
        b.vy = b.vy * Math.exp(-1.2 * dt) + 520 * dt;
        b.wob += dt * 6;
        b.x += (b.vx + Math.sin(b.wob) * 40) * dt;
        b.y += b.vy * dt;
        b.rot += b.vr * dt;
        if (b.y > H + 40) { bits.splice(i, 1); continue; }
        g.save();
        g.translate(b.x, b.y);
        g.rotate(b.rot);
        g.scale(1, Math.abs(Math.cos(b.wob)) * 0.8 + 0.2);   // flutter
        g.fillStyle = b.color;
        g.fillRect(-b.w / 2, -b.h / 2, b.w, b.h);
        g.restore();
      }
      if (bits.length || elapsed < rainMs) requestAnimationFrame(step);
      else { g.clearRect(0, 0, W, H); resolve(); }
    };
    requestAnimationFrame(step);
  });
}

/* The win sequence. Returns a cancel function (for Restart / Title). */
export function celebrate({ renderer, canvas, banner, origin, onDone, sound }) {
  let cancelled = false;
  const timers = [];
  const later = (ms, fn) => timers.push(setTimeout(() => { if (!cancelled) fn(); }, ms));
  const cleanup = () => {
    canvas.hidden = true;
    banner.hidden = true;
    banner.classList.remove('show');
    if (renderer) renderer.msgForce = null;
  };

  if (renderer) renderer.msgForce = 1;           // 1. the message turns fully solid
  // Wait until it really is 100% opaque (frame-rate independent), hold it
  // there for a beat, then...
  const solid = () => new Promise((res) => {
    const check = () => (cancelled || !renderer || renderer.msgAlpha >= 1 ? res() : requestAnimationFrame(check));
    check();
  });
  solid().then(() => later(900, async () => {   // 2. ...it explodes
    if (renderer) { renderer.explodeMessage(); renderer.msgForce = 0; }
    if (sound) sound();
    canvas.hidden = false;
    await confetti(canvas, origin);              // 3. confetti everywhere, then it clears
    if (cancelled) return;
    canvas.hidden = true;
    banner.hidden = false;                       // 4. GOOD JOB, DREW
    requestAnimationFrame(() => banner.classList.add('show'));
    later(3200, () => {                          // 5. banner fades, results come up
      banner.classList.remove('show');
      later(600, () => { banner.hidden = true; if (onDone) onDone(); });
    });
  }));

  return () => { cancelled = true; timers.forEach(clearTimeout); cleanup(); };
}
