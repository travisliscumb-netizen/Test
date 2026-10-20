/* =====================================================================
   [CORE] DYNAMIC SPATIAL HASH (vehicles + characters, rebuilt each frame)
   ===================================================================== */
class DynHash {
  constructor(cs = 10) { this.cs = cs; this.map = new Map(); this.pool = []; }
  clear() { for (const a of this.map.values()) { a.length = 0; this.pool.push(a); } this.map.clear(); }
  _k(i, j) { return (i + 512) * 4096 + (j + 512); }
  insert(e) {
    const i = Math.floor(e.x / this.cs), j = Math.floor(e.z / this.cs), k = this._k(i, j);
    let a = this.map.get(k); if (!a) { a = this.pool.pop() || []; this.map.set(k, a); }
    a.push(e);
  }
  query(x, z, r, out) {
    out.length = 0;
    const i0 = Math.floor((x - r) / this.cs), i1 = Math.floor((x + r) / this.cs), j0 = Math.floor((z - r) / this.cs), j1 = Math.floor((z + r) / this.cs);
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) { const a = this.map.get(this._k(i, j)); if (a) for (const e of a) out.push(e); }
    return out;
  }
}

