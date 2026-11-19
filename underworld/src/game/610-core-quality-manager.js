/* =====================================================================
   [CORE] QUALITY MANAGER (presets + adaptive resolution / detail)
   ===================================================================== */
// pr caps the device pixel ratio (G2: Medium was 0.9, under a phone's CSS resolution and visibly soft on a Retina
// screen; it is now 1.25, with dynamic resolution below to give pixels back when a frame runs long). Low stays 0.7:
// it is the weak-device preset
const QUALITY = [
  { name: 'Low', pr: 0.7, shadow: 0, post: false, msaa: 0, chunkR: 2, propR: 130, parkedR: 110, traffic: 9, peds: 16 },
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
  // the preset's pixel ratio on this screen, and how far dynamic resolution may take it (see update)
  basePR() { return Math.min(Math.min(window.devicePixelRatio || 1, 3), QUALITY[this.level].pr); }
  drsFloor() { const base = this.basePR(); return this.level === 0 ? 0.85 : clamp(Math.max(0.85, 1 / base), 0.85, 1); }
  setMode(m) { this.mode = m; if (m !== 'auto') this.level = m; this.apply(); }
  apply() {
    const g = this.g, q = QUALITY[this.level], s = g.save.settings;
    this.dynScale = Math.max(this.drsFloor(), this.dynScale || 1);
    g.renderer.setPixelRatio(this.basePR() * this.dynScale);
    const sh = s.shadows && q.shadow > 0, shChanged = this._sh !== undefined && this._sh !== sh; this._sh = sh;
    g.renderer.shadowMap.enabled = sh;
    g.env.sun.castShadow = sh;
    if (sh && g.env.sun.shadow.mapSize.x !== q.shadow) { g.env.sun.shadow.mapSize.set(q.shadow, q.shadow); if (g.env.sun.shadow.map) { g.env.sun.shadow.map.dispose(); g.env.sun.shadow.map = null; } }
    g.usePost = s.post && q.post;
    INT_LIT.value = this.level >= 1 ? 1 : 0; // rooms lit per lamp from Medium up; Low keeps their baked look
    g.chunks.setRadius(q.chunkR);
    g.traffic.target = q.traffic; g.peds.target = q.peds;
    g.propR = q.propR; g.parkedR = q.parkedR;
    g.setupPost(q.msaa);
    g.onResize();
    // shadows on or off changes every lit material's program: compile them all now (in the background where the
    // browser compiles in parallel), not one by one the first time each comes into view, a hitch per new district
    if (shChanged && this.g.compiled) {
      const r = g.renderer, par = r.compileAsync && r.extensions.has('KHR_parallel_shader_compile');
      try { if (par) r.compileAsync(g.scene, g.camera).catch(() => {}); else r.compile(g.scene, g.camera); } catch { /* an optimisation only */ }
      g.warmShaders();
    }
  }
  update(dt) {
    if (this.mode !== 'auto' || this.g.state !== 'playing') return;
    this.acc += dt; this.frames++; this.cool -= dt;
    // dynamic resolution, the last resort (2026-11-18: it used to take up to 40% of the pixels away first, which is
    // what made the island builds soft: the heavier world held frames over 21 ms and the image sat at 60%). A slow
    // frame now costs the preset's real work first (shadow map, draw distance, crowds, MSAA: below); only on the lowest
    // preset it is on, or once the preset can drop no further, does resolution give way, by 15% at most and never
    // under the screen's own CSS pixels from Medium up
    this.drsAcc = (this.drsAcc || 0) + dt; this.drsN = (this.drsN || 0) + 1;
    if (this.drsAcc >= 1) {
      const ms = this.drsAcc / this.drsN * 1000, k = this.dynScale || 1; this.drsAcc = 0; this.drsN = 0;
      const floorK = this.drsFloor(), lastResort = this.level === 0 || (this.level === 1 && this.cool <= 0);
      const nk = ms > 24 && lastResort ? Math.max(floorK, k * 0.95) : ms < 16 ? Math.min(1, k * 1.05) : k;
      if (Math.abs(nk - k) > 0.004) { this.dynScale = nk; this.g.renderer.setPixelRatio(this.basePR() * nk); this.g.onResize(); }
    }
    if (this.acc >= 2) {
      const ms = this.acc / this.frames * 1000; this.acc = 0; this.frames = 0;
      if (this.cool > 0) return;
      // presets step down before any pixels go (above); to Low (the weak-device preset, 0.7 of the screen's pixels)
      // only when frames are truly struggling
      if (ms > (this.level === 1 ? 34 : 24) && this.level > 0) { this.level--; this.cool = 5; this.apply(); this.g.ui.toast(`Graphics adjusted to ${QUALITY[this.level].name} for smoother play.`); }
      else if (ms < 12.5 && this.level < (IS_MOBILE ? 2 : 3) && !this.droppedFrom?.[this.level + 1]) { this.level++; this.cool = 8; this.apply(); }
      if (ms > 24) { this.droppedFrom = this.droppedFrom || {}; this.droppedFrom[this.level + 1] = true; }
    }
  }
}

