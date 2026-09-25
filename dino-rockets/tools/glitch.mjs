/* Frame-by-frame glitch finder, shared by the glitch QA and the playtest.

   Looks at a per-frame trace from the stage (stage.trace) and reports what
   a child sees as a glitch: something that jumps across the screen in one
   frame, snaps its rotation or size, pops in or out of existence on screen,
   stays twisted after a move, or flickers left-right. */
/* the on-screen difference between two angles: 486° and 126° look the same */
const wrap = d => { d %= 360; return d > 180 ? d - 360 : (d < -180 ? d + 360 : d); };
export function findGlitches(frames, vw, vh) {
  const out = [];
  const seen = new Set();
  function report(rule, who, t, detail) {
    const key = rule + ':' + who;
    const first = !seen.has(key);
    seen.add(key);
    out.push({ rule, who, t: Math.round(t), detail, first });
  }
  const onScreen = (x, y, w, h) => x + w > 0 && x < vw && y + h > 0 && y < vh;
  const flips = {};
  for (let i = 1; i < frames.length; i++) {
    const A = frames[i - 1], B = frames[i];
    const dt = B.t - A.t;
    if (dt <= 0 || dt > 100 || A.live !== B.live) continue;     /* a scene start/end is a cut, not a frame */
    for (const k of Object.keys(B.actors)) {
      const a = A.actors[k], b = B.actors[k];
      if (!a || !b) continue;
      const va = a.op > 0.5 && onScreen(a.x, a.y, 150 * a.sc, 150 * a.sc);
      const vb = b.op > 0.5 && onScreen(b.x, b.y, 150 * b.sc, 150 * b.sc);
      if (va && vb) {
        const d = Math.hypot(b.x - a.x, b.y - a.y);
        if (d > Math.max(40, 4 * dt)) report('actor teleport', k, B.t, `${Math.round(d)}px in ${Math.round(dt)}ms`);
        if (!a.spin && !b.spin && Math.abs(wrap(b.rot - a.rot)) > 25) report('actor rotation snap', k, B.t, `${Math.round(a.rot)}→${Math.round(b.rot)}`);
        if (!b.spin && Math.abs(wrap(b.rot)) > 100) report('actor left twisted', k, B.t, `rot ${Math.round(b.rot)}`);
        if (Math.abs(b.sc - a.sc) > 0.12) report('actor scale snap', k, B.t, `${a.sc.toFixed(2)}→${b.sc.toFixed(2)}`);
      }
      if (va && b.op < 0.1 && onScreen(b.x, b.y, 150, 150)) report('actor vanishes on screen', k, B.t, `op ${a.op.toFixed(2)}→${b.op.toFixed(2)}`);
      if (vb && a.op < 0.1 && onScreen(a.x, a.y, 150, 150)) report('actor pops in on screen', k, B.t, `op ${a.op.toFixed(2)}→${b.op.toFixed(2)}`);
      if (vb && Math.sign(a.face) !== Math.sign(b.face)) {
        const f = (flips[k] = (flips[k] || []).filter(t => B.t - t < 500));
        f.push(B.t);
        if (f.length > 2) report('facing flicker', k, B.t, `${f.length} turns in 500ms`);
      }
    }
    const n = Math.min(A.props.length, B.props.length);
    for (let j = 0; j < n; j++) {
      const a = A.props[j], b = B.props[j];
      const va = a.op > 0.3 && onScreen(a.x - a.w / 2, a.y - a.h / 2, a.w, a.h);
      const vb = b.op > 0.3 && onScreen(b.x - b.w / 2, b.y - b.h / 2, b.w, b.h);
      if (va && vb) {
        const d = Math.hypot(b.x - a.x, b.y - a.y);
        if (d > Math.max(40, 3 * dt)) report('letter teleport', `#${j}`, B.t, `${Math.round(d)}px in ${Math.round(dt)}ms (${a.st}→${b.st})`);
        if (Math.abs(wrap(b.rot - a.rot)) > 60) report('letter rotation snap', `#${j}`, B.t, `${Math.round(a.rot)}→${Math.round(b.rot)} (${a.st}→${b.st})`);
      }
      if (va && b.op < 0.1 && onScreen(b.x - b.w / 2, b.y - b.h / 2, b.w, b.h)) report('letter vanishes on screen', `#${j}`, B.t, `${a.st}→${b.st}`);
    }
  }
  return out;
}
