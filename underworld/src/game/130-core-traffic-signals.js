/* =====================================================================
   [CORE] TRAFFIC SIGNALS (shared timing used by AI, peds, and bulbs)
   ===================================================================== */
const Signals = {
  cycle: 26,
  t: 0,
  offset(i, j) { return hash2i(i, j, 77) * 26; },
  // axis 0 = traffic on vertical (N-S) roads, 1 = traffic on horizontal (E-W) roads. 0 green, 1 yellow, 2 red
  state(i, j, axis) {
    const c = (this.t + this.offset(i, j)) % 26;
    const a = axis === 0 ? c : (c + 13) % 26;
    return a < 10 ? 0 : a < 12.5 ? 1 : 2;
  },
  pedSafe(i, j, crossingAxisRoad) {
    // crossing a road whose traffic runs on `crossingAxisRoad` is safe when that traffic has red (with margin)
    const c = (this.t + this.offset(i, j)) % 26;
    const a = crossingAxisRoad === 0 ? c : (c + 13) % 26;
    return a > 13.2 && a < 22.5;
  }
};

