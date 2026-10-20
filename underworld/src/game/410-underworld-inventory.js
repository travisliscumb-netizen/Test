/* =====================================================================
   [UNDERWORLD] INVENTORY: every unit of product belongs to exactly one place
   (ON PERSON, a VEHICLE trunk, a SAFEHOUSE, a PROPERTY or a WAREHOUSE).
   Quantities are whole "lots" internally (integers, so nothing can be
   duplicated or lost to rounding) and shown in game units: Green 0.5 lb a
   lot, Pharma 0.25 lb, Snow 0.1 lb, Hardware/Hot goods/Smokes by the piece.
   Each container also carries its cost basis in a reserved "$cb" key (total
   dollars paid for what is in it), so moving goods moves their cost with them,
   a market swing changes value but never quantity or cost, and selling
   realises profit against the average cost.
   ===================================================================== */
const GOOD_UNIT = { hot: ['item', 'items', 1], smokes: ['carton', 'cartons', 1], green: ['lb', 'lb', 0.5], pills: ['lb', 'lb', 0.25], snow: ['lb', 'lb', 0.1], hardware: ['unit', 'units', 1] };
// how many lots make up the quantities offered at suppliers / buyers: 1, 2, 5 lb (or 1, 5, 20 pieces)
function lotsFor(k, qty) { return Math.max(1, Math.round(qty / GOOD_UNIT[k][2])); }
function qtyOf(k, n) { return n * GOOD_UNIT[k][2]; }
function fmtQty(k, n) {
  const [one, many, per] = GOOD_UNIT[k] || ['unit', 'units', 1], q = n * per;
  if (per >= 1) return `${q} ${q === 1 ? one : many}`;
  const s = Math.abs(q * 10 - Math.round(q * 10)) < 1e-6 ? q.toFixed(1) : q.toFixed(2);
  return `${s} ${many}`;
}
function unitName(k) { return GOOD_UNIT[k][2] < 1 ? 'lb' : GOOD_UNIT[k][0]; }
// price of one display unit (one lb, one carton...) from a price per lot
function perUnit(k, lotPrice) { return lotPrice / GOOD_UNIT[k][2]; }
function fmtPerUnit(k, lotPrice) { return `${fmtMoney(perUnit(k, lotPrice))}/${unitName(k)}`; }
const Inv = {
  has(o, k) { return o && o[k] > 0 ? o[k] | 0 : 0; },
  cost(o, k) { return o && o.$cb && o.$cb[k] > 0 ? o.$cb[k] : 0; },
  avg(o, k) { const n = Inv.has(o, k); return n ? Inv.cost(o, k) / n : 0; },
  add(o, k, n, cost = 0) {
    n = Math.floor(n); if (!GOODS[k] || !(n > 0)) return 0;
    o[k] = (o[k] | 0) + n;
    if (cost > 0) { const cb = o.$cb || (o.$cb = {}); cb[k] = (cb[k] || 0) + cost; }
    return n;
  },
  // take n lots out; returns the cost basis that leaves with them (average cost)
  remove(o, k, n) {
    const have = Inv.has(o, k); n = Math.min(Math.floor(n), have); if (!(n > 0)) return 0;
    let c = 0;
    if (o.$cb && o.$cb[k] > 0) { c = o.$cb[k] * n / have; o.$cb[k] -= c; if (have - n <= 0 || o.$cb[k] < 0.005) delete o.$cb[k]; }
    o[k] = have - n; if (!o[k]) delete o[k];
    if (o.$cb && !Object.keys(o.$cb).length) delete o.$cb;
    return c;
  },
  // move up to n lots; the destination may be capacity-limited (free space in size units)
  move(src, dst, k, n, free = Infinity) {
    const fit = Math.floor(free / GOODS[k].size);
    n = Math.min(Math.floor(n), Inv.has(src, k), fit); if (!(n > 0)) return 0;
    const c = Inv.remove(src, k, n); Inv.add(dst, k, n, c); return n;
  },
  clear(o) { if (!o) return; for (const k of Object.keys(o)) delete o[k]; },
  // lose a share of everything (raids, hospital, rival hits): cost basis shrinks in step
  lose(o, frac) { let lost = 0; if (!o) return 0; for (const k of GOOD_IDS) { const n = Inv.has(o, k); const d = Math.min(n, Math.ceil(n * frac - 1e-9)); if (d > 0) { Inv.remove(o, k, d); lost += d; } } return lost; },
  clone(o) { const r = {}; if (!o) return r; for (const k of GOOD_IDS) if (o[k] > 0) r[k] = o[k] | 0; if (o.$cb) { r.$cb = {}; for (const k in o.$cb) if (r[k]) r.$cb[k] = o.$cb[k]; } return r; },
  // sanitize a container from a save: whole positive lots, a cost basis only for goods present
  clean(o, num) {
    const r = {}; if (!o || typeof o !== 'object') return r;
    for (const k of GOOD_IDS) { const n = Math.floor(num(o[k], 0, 0, 1e5)); if (n > 0) r[k] = n; }
    if (o.$cb && typeof o.$cb === 'object') { const cb = {}; for (const k of GOOD_IDS) if (r[k] && typeof o.$cb[k] === 'number' && isFinite(o.$cb[k]) && o.$cb[k] > 0) cb[k] = Math.min(o.$cb[k], r[k] * 1e5); if (Object.keys(cb).length) r.$cb = cb; }
    return r;
  }
};
// the five kinds of place goods can be (Part 14 of the design): property kind -> location class
const LOC_CLASS = { safehouse: 'SAFEHOUSE', business: 'PROPERTY', garage: 'PROPERTY', warehouse: 'WAREHOUSE' };
const LOC_ORDER = ['ON PERSON', 'VEHICLE', 'SAFEHOUSE', 'PROPERTY', 'WAREHOUSE'];
// valuation of one container at a district's street price: per good qty, cost, value, P/L
function holdings(o, zone, market) {
  const rows = [];
  for (const k of GOOD_IDS) {
    const n = Inv.has(o, k); if (!n) continue;
    const lot = market.price(zone, k), cost = Inv.cost(o, k), value = lot * n;
    rows.push({ k, n, cost, avg: cost / n, lot, value, pl: value - cost, qty: qtyOf(k, n) });
  }
  return rows;
}
// weapons, ammo and armour kept at a property (Part 17). Guns are single owned items: where a
// gun is lives in save.wloc[id] (null = carried); the stash holds ammo boxes and spare vests.
function freshWStash() { return { ammo: { pistol: 0, smg: 0, shotgun: 0 }, vests: [] }; }
const ARMORY_GUNS = ['bat', 'pistol', 'smg', 'shotgun'];
