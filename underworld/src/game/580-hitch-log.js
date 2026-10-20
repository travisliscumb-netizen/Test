/* =====================================================================
   HITCH LOG: a lightweight diagnostic for long frames on real devices (the
   first-drive hitch could not be reproduced in headless software rendering).
   Every frame over 120 ms is recorded with what happened just before it
   (getting into a car, an interior, a cab, the map) and the renderer's
   counters. Settings › Diagnostics shows it and copies it as text.
   ===================================================================== */
const HitchLog = {
  list: [], marks: [],
  mark(label) { this.marks.push({ label, at: performance.now() }); if (this.marks.length > 24) this.marks.shift(); },
  frame(g, ms, script) {
    if (ms < 120 || g.state === 'loading' || document.hidden) return;
    const now = performance.now(), info = g.renderer.info;
    this.list.push({ t: Math.round(g.save.stats.playTime), ms: Math.round(ms), script: Math.round(script), on: g.player.state, recent: this.marks.filter(m => now - m.at < 1500).map(m => m.label), progs: info.programs ? info.programs.length : 0, calls: info.render.calls, tris: info.render.triangles, q: g.quality ? g.quality.mode : null });
    if (this.list.length > 40) this.list.shift();
  },
  text() {
    const ua = navigator.userAgent, head = `The Underworld hitch log · ${new Date().toISOString()} · ${innerWidth}x${innerHeight} @${devicePixelRatio} · ${ua}`;
    return [head, ...this.list.map(e => `t=${e.t}s frame ${e.ms} ms (script ${e.script} ms) ${e.on}${e.recent.length ? ' after: ' + e.recent.join(', ') : ''} · shaders ${e.progs} · calls ${e.calls} · tris ${e.tris} · quality ${e.q}`)].join('\n');
  }
};
window.__pvHitches = HitchLog;

