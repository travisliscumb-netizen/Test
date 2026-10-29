/* =====================================================================
   [CORE] QUALITY MANAGER (presets + adaptive resolution / detail)
   ===================================================================== */
// pr caps the device pixel ratio (G2: Medium was 0.9, under a phone's CSS resolution and visibly soft on a Retina
// screen; it is now 1.25, with dynamic resolution below to give pixels back when a frame runs long)
const QUALITY = [
  { name: 'Low', pr: 0.85, shadow: 0, post: false, msaa: 0, chunkR: 2, propR: 130, parkedR: 110, traffic: 9, peds: 16 },
  { name: 'Medium', pr: 1.25, shadow: 1024, post: true, msaa: 0, chunkR: 3, propR: 170, parkedR: 130, traffic: 15, peds: 26 },
  { name: 'High', pr: 1.6, shadow: 2048, post: true, msaa: 4, chunkR: 4, propR: 210, parkedR: 150, traffic: 22, peds: 38 },
  { name: 'Ultra', pr: 2, shadow: 4096, post: true, msaa: 4, chunkR: 5, propR: 250, parkedR: 160, traffic: 28, peds: 50 }
];
class QualityManager {
  constructor(game) {
    this.g = game; this.mode = game.save.settings.quality;
    this.level = this.mode === 'auto' ? (IS_MOBILE ? 1 : 2) : this.mode;
    this.acc = 0; this.frames = 0; this.cool = 3; this.history = [];
  }
  setMode(m) { this.mode = m; if (m !== 'auto') this.level = m; this.apply(); }
  apply() {
    const g = this.g, q = QUALITY[this.level], s = g.save.settings;
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    g.renderer.setPixelRatio(Math.min(dpr, q.pr) * (this.dynScale || 1));
    const sh = s.shadows && q.shadow > 0;
    g.renderer.shadowMap.enabled = sh;
    g.env.sun.castShadow = sh;
    if (sh && g.env.sun.shadow.mapSize.x !== q.shadow) { g.env.sun.shadow.mapSize.set(q.shadow, q.shadow); if (g.env.sun.shadow.map) { g.env.sun.shadow.map.dispose(); g.env.sun.shadow.map = null; } }
    g.usePost = s.post && q.post;
    g.chunks.setRadius(q.chunkR);
    g.traffic.target = q.traffic; g.peds.target = q.peds;
    g.propR = q.propR; g.parkedR = q.parkedR;
    g.setupPost(q.msaa);
    g.onResize();
  }
  update(dt) {
    if (this.mode !== 'auto' || this.g.state !== 'playing') return;
    this.acc += dt; this.frames++; this.cool -= dt;
    // dynamic resolution (G2): every second, a long frame takes 8% of the pixel ratio away (down to 60% of the
    // preset's), a quick one gives 5% back; whole presets only change when that is not enough (below)
    this.drsAcc = (this.drsAcc || 0) + dt; this.drsN = (this.drsN || 0) + 1;
    if (this.drsAcc >= 1) {
      const ms = this.drsAcc / this.drsN * 1000, k = this.dynScale || 1; this.drsAcc = 0; this.drsN = 0;
      const nk = ms > 21 ? Math.max(0.6, k * 0.92) : ms < 15 ? Math.min(1, k * 1.05) : k;
      if (Math.abs(nk - k) > 0.004) { this.dynScale = nk; this.g.renderer.setPixelRatio(Math.min(Math.min(window.devicePixelRatio || 1, 3), QUALITY[this.level].pr) * nk); this.g.onResize(); }
    }
    if (this.acc >= 2) {
      const ms = this.acc / this.frames * 1000; this.acc = 0; this.frames = 0;
      if (this.cool > 0 || (this.dynScale || 1) > 0.62 && ms > 24) return;
      if (ms > 24 && this.level > 0) { this.level--; this.cool = 5; this.apply(); this.g.ui.toast(`Graphics adjusted to ${QUALITY[this.level].name} for smoother play.`); }
      else if (ms < 12.5 && this.level < (IS_MOBILE ? 2 : 3) && !this.droppedFrom?.[this.level + 1]) { this.level++; this.cool = 8; this.apply(); }
      if (ms > 24) { this.droppedFrom = this.droppedFrom || {}; this.droppedFrom[this.level + 1] = true; }
    }
  }
}

