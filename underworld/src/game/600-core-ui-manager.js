/* =====================================================================
   [CORE] UI MANAGER (HUD, menus, minimap, map, shop, toasts, banners)
   ===================================================================== */
const $ = id => document.getElementById(id);
/* ---------------- HUD layout (phones / touch) ----------------
   CSS alone cannot keep the HUD clear on every phone: the money cluster changes width, the
   radio button comes and goes, the jail panel and objective appear and disappear. HudLayout
   measures what is on screen and places each element greedily: an element starts at its
   preferred spot and drops below anything it would overlap. Bottom text (prompts,
   subtitles, the arrest bar) is lifted above the thumb controls; the speedometer gets a
   slot no button covers. Active on touch devices and narrow/short screens only; everywhere
   else the stylesheet layout is untouched. */
class HudLayout {
  constructor(ui) {
    this.ui = ui; this.t = 0; this.applied = false; this.cache = new Map();
    this.mq = window.matchMedia('(max-width:820px),(max-height:520px)');
    this.dirty = true;
    const mark = () => { this.dirty = true; };
    // the viewport size is cached from resize events: reading innerWidth every frame can flush layout
    this.vw = window.innerWidth; this.vh = window.innerHeight;
    const size = () => { this.vw = window.innerWidth; this.vh = window.innerHeight; this.dirty = true; };
    window.addEventListener('resize', size); window.addEventListener('orientationchange', size);
    if (window.ResizeObserver) { this.ro = new ResizeObserver(mark); for (const id of ['tbar', 'jailHud', 'objective', 'toasts', 'speedo']) { const el = $(id); if (el) this.ro.observe(el); } const tr = document.querySelector('#hud .tr'); if (tr) this.ro.observe(tr); }
  }
  static WATCH = ['touch', 'minimapWrap', 'zone', 'objective', 'tip', 'jailHud', 'taxiHud', 'speedo', 'phone', 'zoneCard', 'prompt', 'moneyFeed'];
  get active() { return document.body.classList.contains('touch') || this.mq.matches; }
  safe() { const cs = getComputedStyle($('safeProbe')); return { t: parseFloat(cs.paddingTop) || 0, r: parseFloat(cs.paddingRight) || 0, b: parseFloat(cs.paddingBottom) || 0, l: parseFloat(cs.paddingLeft) || 0 }; }
  set(el, props) {
    let c = this.cache.get(el); if (!c) { c = {}; this.cache.set(el, c); }
    for (const k in props) if (c[k] !== props[k]) { c[k] = props[k]; el.style[k] = props[k]; }
  }
  clear() {
    for (const [el, c] of this.cache) for (const k in c) el.style[k] = '';
    this.cache.clear(); this.applied = false;
  }
  static rect(el) { if (!el || el.classList.contains('hidden')) return null; const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 ? { l: r.left, t: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height } : null; }
  static hit(a, b, m = 0) { return a.l < b.r + m && a.r > b.l - m && a.t < b.b + m && a.b > b.t - m; }
  // a cheap fingerprint of what the layout depends on (no layout reads): which HUD pieces are shown,
  // the body/state classes, the toast count and the objective's text length. A change relays out at
  // once; ResizeObserver catches size changes; a slow timer is only a safety net. Each layout pass
  // forces reflows, so it must not run on a fixed fast timer.
  sig() {
    let s = document.body.className;
    for (const id of HudLayout.WATCH) { const el = $(id); s += '|' + (el ? el.className : '-'); }
    const tb = $('tbar'); if (tb) for (const c of tb.children) s += '|' + c.className + c.style.display;
    const to = $('toasts'); s += '|' + (to ? to.childElementCount : 0);
    const ot = document.querySelector('#objective .ot'); s += '|' + (ot ? ot.textContent.length : 0);
    const zn = $('zone'); s += '|' + (zn ? zn.textContent.length : 0);
    return s;
  }
  tick(dt, force) {
    this.t -= dt;
    const sg = this.sig(); if (sg !== this.lastSig) { this.lastSig = sg; this.dirty = true; }
    if (!force && !this.dirty && this.t > 0) return;
    this.t = 1; this.dirty = false;
    if (!this.active) { if (this.applied) this.clear(); return; }
    this.applied = true;
    this.layout();
  }
  layout() {
    const W = window.innerWidth, H = window.innerHeight, sf = this.safe(), R = HudLayout.rect, gap = 8;
    const touch = document.body.classList.contains('touch') && !$('touch').classList.contains('hidden');
    const mm = R($('minimapWrap')), tr = R(document.querySelector('#hud .tr'));
    const mmTop = mm && mm.t < H / 2;
    // 1. the action bar: beside the minimap if it fits in two rows, else one row under it
    const tbar = $('tbar');
    let tb = null;
    if (touch && tbar) {
      const n = [...tbar.children].filter(c => getComputedStyle(c).display !== 'none').length, bw = 46;
      const trL = tr ? tr.l - 10 : W - sf.r - 12;
      let left, top, width;
      if (mmTop) {
        left = mm.r + 12; width = Math.max(0, trL - left);
        const per = Math.floor((width + gap) / (bw + gap)), rows = per > 0 ? Math.ceil(n / per) : 99;
        top = sf.t + 12;
        if (rows > 2) { left = sf.l + 12; top = mm.b + 12; width = (tr && tr.b > top - 4 ? tr.l - 10 : W - sf.r - 12) - left; }
      } else { left = sf.l + 12; top = sf.t + 12; width = trL - left; }
      width = Math.max(bw, width);
      this.set(tbar, { left: Math.round(left) + 'px', top: Math.round(top) + 'px', width: Math.round(width) + 'px', right: 'auto' });
      tb = R(tbar);
      // shrink to the buttons actually laid out (the flex box is as wide as its width)
      if (tb) { let rr = tb.l, bb = tb.t; for (const c of tbar.children) { const q = R(c); if (q) { rr = Math.max(rr, q.r); bb = Math.max(bb, q.b); } } tb = { l: tb.l, t: tb.t, r: rr, b: bb, w: rr - tb.l, h: bb - tb.t }; }
    }
    const placed = [mm, tr, tb].filter(Boolean);
    const spanL = tb && tb.t < (mm ? mm.b : 200) ? tb.r + 10 : (mmTop && mm ? mm.r + 10 : sf.l + 12), spanR = tr ? tr.l - 10 : W - sf.r - 12;
    // drop an element down from its preferred top until it overlaps nothing already placed.
    // Its real rect is re-measured after every move: a box's width can depend on where it sits.
    const conflict = (c) => { let low = -1; for (const q of placed) if (HudLayout.hit(c, q, 3)) low = Math.max(low, q.b); return low; };
    // fit: a panel that would run past the bottom of the screen keeps to the room left and scrolls inside
    const drop = (el, xmode, y0 = sf.t + 10, fit = false) => {
      if (fit && el && el.style.maxHeight) { el.style.maxHeight = ''; el.style.overflowY = ''; }
      let r0 = R(el); if (!r0) return null;
      const xFor = (w, below) => {
        let x;
        if (xmode === 'left') x = sf.l + 12;
        else if (xmode === 'right') x = W - sf.r - 14 - w;
        else x = (!below && spanR - spanL >= w) ? (spanL + spanR) / 2 - w / 2 : W / 2 - w / 2;
        return clamp(x, sf.l + 4, Math.max(sf.l + 4, W - sf.r - 4 - w));
      };
      let y = y0, below = false, out = null;
      for (let k = 0; k < 24; k++) {
        const x = xFor(r0.w, below);
        this.set(el, { left: Math.round(x) + 'px', top: Math.round(y) + 'px', right: 'auto', bottom: 'auto', transform: 'none' });
        r0 = R(el) || r0;
        out = { l: r0.l, t: r0.t, r: r0.r, b: r0.b, w: r0.w, h: r0.h };
        const low = conflict(out);
        if (low < 0) break;
        y = low + gap;
        below = (tb ? y > tb.b : true) && (tr ? y > tr.b : true);
      }
      if (fit && out && out.b > H - sf.b - 4) {
        const room = Math.max(60, Math.floor(H - sf.b - 4 - out.t));
        el.style.maxHeight = room + 'px'; el.style.overflowY = 'auto';
        r0 = R(el) || r0; out = { l: r0.l, t: r0.t, r: r0.r, b: r0.b, w: r0.w, h: r0.h };
      }
      placed.push(out); return out;
    };
    // the money feed hangs under the money cluster while it shows: right-hand cards drop below it
    const mf = $('moneyFeed');
    if (tr && mf && mf.classList.contains('on')) placed.push({ l: tr.l, r: tr.r, t: tr.b, b: tr.b + 4 + 4 * 22, w: tr.w, h: 92 });
    drop($('jailHud'), 'center', undefined, true);
    drop($('taxiHud'), 'center');
    drop($('objective'), 'center');
    drop($('tip'), 'center');
    drop($('raceHud'), 'right');
    drop($('phone'), 'right');
    drop($('zoneCard'), 'center');
    // 2. bottom: thumb controls are obstacles for the speedometer and for centred text
    const ctl = [];
    if (touch) for (const b of document.querySelectorAll('#touch > .tbtn')) { const q = R(b); if (q && getComputedStyle(b).display !== 'none') ctl.push(q); }
    if (mm && !mmTop) ctl.push(mm);
    const sp = $('speedo'), driving = document.body.classList.contains('driving');
    let spR = null;
    if (sp && touch && driving) {
      const r0 = R(sp);
      if (r0) {
        const w = r0.w, h = r0.h;
        let top = H, left = W, right = 0; for (const q of ctl) if (q.l > W * 0.4) { top = Math.min(top, q.t); left = Math.min(left, q.l); right = Math.max(right, q.r); }
        if (!right) { top = H - sf.b; left = W - sf.r; right = W - sf.r - 14; }
        // candidates: bottom centre, left of the pedals, above the pedals
        const cands = [[W / 2 - w / 2, H - sf.b - 10 - h], [left - 12 - w, H - sf.b - 10 - h], [right - w, top - 10 - h], [sf.l + 6, H - sf.b - 10 - h], [W / 2 - w / 2, top - 10 - h]];
        let best = null, bestScore = 1e9;
        for (const [cx, cy] of cands) {
          const c = { l: cx, t: cy, r: cx + w, b: cy + h };
          const off = c.l < sf.l + 4 || c.t < sf.t + 4 || c.r > W - sf.r - 4 || c.b > H - 2;
          const score = (off ? 1000 : 0) + ctl.filter(q => HudLayout.hit(c, q, 2)).length * 100 + placed.filter(q => HudLayout.hit(c, q, 3)).length * 10;
          if (score < bestScore) { bestScore = score; best = c; if (!score) break; }
        }
        best.l = clamp(best.l, sf.l + 4, W - sf.r - 4 - w); best.r = best.l + w;
        this.set(sp, { left: Math.round(best.l) + 'px', top: Math.round(best.t) + 'px', right: 'auto', bottom: 'auto', transform: 'none' });
        spR = best; placed.push(best);
      }
    } else if (sp && this.cache.has(sp)) { const c = this.cache.get(sp); for (const k in c) sp.style[k] = ''; this.cache.delete(sp); }
    for (const q of ctl) placed.push(q);
    drop($('zone'), 'left'); // faded out by opacity only, so it keeps its slot and never jumps
    drop($('toasts'), 'left');
    const obst = spR ? ctl.concat([spR]) : ctl;
    // centred text: keep its CSS spot unless a control covers it, then lift it clear
    for (const id of ['prompt', 'subtitle', 'bustbar', 'offer']) {
      const el = $(id); if (!el) continue;
      if (this.cache.has(el)) { const c = this.cache.get(el); for (const k in c) el.style[k] = ''; this.cache.delete(el); }
      const r0 = R(el); if (!r0) continue;
      let y = r0.t; const cand = { l: r0.l, t: y, r: r0.r, b: y + r0.h };
      let moved = false;
      for (let k = 0; k < 8; k++) {
        const hit = obst.filter(q => HudLayout.hit(cand, q, 4)); if (!hit.length) break;
        y = Math.min(...hit.map(q => q.t)) - 8 - r0.h; cand.t = y; cand.b = y + r0.h; moved = true;
      }
      if (moved) this.set(el, { top: Math.round(Math.max(sf.t + 4, y)) + 'px', bottom: 'auto' });
    }
  }
}
const MAP_LAND_COLS = { D: '#4a505c', C: '#545a63', R: '#5c514a', H: '#4d5c47', I: '#575049', P: '#355e37', K: '#454a52', X: '#6b5b45', S: '#545a63', W: '#4f6a48', G: '#2f6a34', A: '#4a4f57', T: '#5a5650', F: '#6b6a3a' };
const UPGRADES = [
  { id: 'stamina', name: 'Lungs', desc: 'Sprint longer and slightly faster.', prices: [800, 1600, 3200] },
  { id: 'health', name: 'Constitution', desc: '+60 maximum health per level (300 at the start, 480 at the top).', prices: [1000, 2200, 4400] },
];
// §18: personal upgrades are Stamina and Health only (Handling, Low Profile and Body Armor were removed, §45.12)
class UIManager {
  constructor(game) {
    this.g = game; this.modal = null; this.stack = [];
    this.hud = $('hud'); this.toasts = $('toasts');
    this.mm = $('minimap'); this.mmc = this.mm.getContext('2d');
    this.bigc = $('bigmapCanvas').getContext('2d');
    this.mapImg = this._renderMap(false); this.mmImg = this._renderMap(false); this.vpImg = this._renderVP();
    this.hudT = 0; this.mmT = 0; this.bannerUntil = 0; this.lastMoney = -1;
    this.layout = new HudLayout(this);
    this.feed = []; MoneyFeed.sink = (e, merged) => this.moneyPop(e, merged);
    this._bind();
  }
  // labels = false draws no text: the rotating minimap and the zoomable big map draw labels on top
  _renderMap(labels = true) {
    const S = 1024, c = document.createElement('canvas'); c.width = S; c.height = S;
    const g = c.getContext('2d');
    const E = EDGE_MARGIN + 30, span = CITY + E * 2, k = S / span;
    // map space runs on east past the city to Valen Point (Session 6B): mapW wide, 1024 tall
    this.mapK = k; this.mapE = E; this.mapW = Math.ceil((WORLD_X1 + E) * k);
    const X = x => (x + E) * k;
    this._paintMap(g, null);
    const lab = [];
    const zc = {};
    for (let bz = 0; bz < N; bz++) for (let bx = 0; bx < N; bx++) { const key = ZONE_MAP[bz][bx]; (zc[key] || (zc[key] = [])).push([bx + 0.5, bz + 0.5]); }
    g.textAlign = 'center'; g.font = 'bold 16px Arial';
    for (const key in zc) {
      const pts = zc[key]; let sx = 0, sz = 0; for (const q of pts) { sx += q[0]; sz += q[1]; }
      let cx = sx / pts.length, cz = sz / pts.length;
      // snap the label onto a block of its own district
      let best = pts[0], bd = 1e9; for (const q of pts) { const d = (q[0] - cx) ** 2 + (q[1] - cz) ** 2; if (d < bd) { bd = d; best = q; } }
      cx = best[0]; cz = best[1];
      lab.push({ t: ZONES[key].name.toUpperCase(), x: X(cx * P), z: X(cz * P), col: ZONES[key].col, big: true });
      if (!labels) continue;
      g.fillStyle = 'rgba(0,0,0,0.55)'; g.fillText(ZONES[key].name.toUpperCase(), X(cx * P) + 1.5, X(cz * P) + 1.5);
      g.fillStyle = ZONES[key].col; g.fillText(ZONES[key].name.toUpperCase(), X(cx * P), X(cz * P));
    }
    // landmarks
    g.font = 'bold 11px Arial';
    for (const key in LANDMARK_BLOCKS) {
      const [bx, bz] = key.split(',').map(Number), L = LANDMARK_BLOCKS[key];
      const x = X(bx * P + P / 2), z = X(bz * P + P / 2) + 16;
      g.fillStyle = 'rgba(10,12,18,0.8)'; g.beginPath(); g.arc(x, z, 8, 0, 7); g.fill();
      lab.push({ t: L.icon, x, z: z + 4, col: '#ffffff' }, { t: L.name, x, z: z + 20, col: 'rgba(255,255,255,0.75)' });
      if (!labels) continue;
      g.fillStyle = '#ffffff'; g.fillText(L.icon, x, z + 4);
      g.fillStyle = 'rgba(255,255,255,0.75)'; g.fillText(L.name, x, z + 20);
    }
    c.labels = lab;
    return c;
  }
  // Valen Point in map space: the causeway, the island, the paved areas, the circuit, the buildings
  _paintVP(g, view) {
    const vp = this.g.world.vp; if (!vp) return;
    const k = this.mapK, E = this.mapE, X = x => (x + E) * k;
    if (view && (view.x1 < CITY || view.x0 > VP.x1 || view.z1 < VP.z0 - 40 || view.z0 > VP.z1 + 40)) return;
    const R = (x0, z0, x1, z1, col) => { g.fillStyle = col; g.fillRect(X(x0), X(z0), (x1 - x0) * k, (z1 - z0) * k); };
    R(CITY + ROAD_HALF, VP.cw.z - VP.cw.half - 2, VP.x0, VP.cw.z + VP.cw.half + 2, '#3d3a36');
    R(CITY + ROAD_HALF, VP.cw.z - VP.cw.road, VP_SITE.ring.x, VP.cw.z + VP.cw.road, '#6f7682');
    R(VP.x0, VP.z0, VP.x1, VP.z1, '#4f6e3f');
    const S = VP_SITE;
    for (const r of [S.paddock, S.parkN, S.parkS]) R(r.x0, r.z0, r.x1, r.z1, '#77787a');
    R(VP_PIT.laneX - VP_PIT.laneW / 2, VP_PIT.lane[0], VP_PIT.laneX + VP_PIT.laneW / 2, VP_PIT.lane[1], '#6f7682');
    g.fillStyle = '#6f7682'; g.beginPath(); g.arc(X(S.ring.x), X(S.ring.z), (S.ring.r + VP.cw.road) * k, 0, 7); g.fill();
    // the circuit
    const T = vp.track;
    g.strokeStyle = '#2b2d30'; g.lineWidth = Math.max(2, VP_TRACK.w * k); g.lineJoin = 'round';
    g.beginPath(); T.pts.forEach((p, i) => i ? g.lineTo(X(p[0]), X(p[1])) : g.moveTo(X(p[0]), X(p[1]))); g.closePath(); g.stroke();
    g.strokeStyle = 'rgba(255,255,255,0.35)'; g.lineWidth = 1; g.stroke();
    // buildings
    g.fillStyle = 'rgba(0,0,0,0.32)';
    for (const b of this.g.world.xblocks) for (const r of b.bld) g.fillRect(X(r.x0), X(r.z0), (r.x1 - r.x0) * k, (r.z1 - r.z0) * k);
  }
  // a cached image of Valen Point for the minimap and the zoomed-out big map: { img, x, z } in map space
  _renderVP() {
    const k = this.mapK, E = this.mapE, X = x => (x + E) * k;
    const x0 = Math.floor(X(CITY + EDGE_MARGIN)), z0 = Math.floor(X(VP.z0 - 30)), w = Math.ceil(X(WORLD_X1)) - x0, h = Math.ceil(X(VP.z1 + 30)) - z0;
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const g = c.getContext('2d'); g.fillStyle = '#0f2b3a'; g.fillRect(0, 0, w, h); g.translate(-x0, -z0);
    this._paintVP(g, null);
    return { img: c, x: x0, z: z0 };
  }
  // paints the city (no text) in 1024-unit map space onto any 2D context; view = world-space
  // rectangle to cull to (null = everything). Used for the cached images and the live big map.
  _paintMap(g, view) {
    const k = this.mapK, E = this.mapE, X = x => (x + E) * k;
    const inView = (x0, z0, x1, z1) => !view || (x1 >= view.x0 && x0 <= view.x1 && z1 >= view.z0 && z0 <= view.z1);
    g.fillStyle = '#0f2b3a'; g.fillRect(X(-E), X(-E), (CITY + E * 2) * k, (CITY + E * 2) * k);
    g.fillStyle = '#3d3a36'; g.fillRect(X(-EDGE_MARGIN), X(-EDGE_MARGIN), (CITY + EDGE_MARGIN * 2) * k, (CITY + EDGE_MARGIN * 2) * k);
    g.fillStyle = '#6f7682'; g.fillRect(X(-ROAD_HALF), X(-ROAD_HALF), (CITY + ROAD_HALF * 2) * k, (CITY + ROAD_HALF * 2) * k);
    const cols = MAP_LAND_COLS;
    for (const b of this.g.world.blocks) {
      if (!inView(b.bx * P - P * 0.25, b.bz * P - P * 0.25, (b.bx + 1.25) * P, (b.bz + 1.25) * P)) continue;
      g.fillStyle = cols[b.special === 'hospital' || b.special === 'police' ? 'S' : b.t] || cols.C;
      g.fillRect(X(b.bx * P + ROAD_HALF), X(b.bz * P + ROAD_HALF), (P - ROAD_HALF * 2) * k, (P - ROAD_HALF * 2) * k);
    }
    if (this.g.world.paintMapExtra) this.g.world.paintMapExtra(g, X, k, view, 'ground');
    for (const b of this.g.world.blocks) {
      if (!inView(b.bx * P - P * 0.25, b.bz * P - P * 0.25, (b.bx + 1.25) * P, (b.bz + 1.25) * P)) continue;
      g.fillStyle = 'rgba(0,0,0,0.28)';
      for (const r of b.bld) if (r.far !== false || r.y0 <= CURB_H + 0.01) g.fillRect(X(r.x0), X(r.z0), (r.x1 - r.x0) * k, (r.z1 - r.z0) * k);
      if (b.t === 'P' && !b.superblock) { g.fillStyle = '#2f6e8a'; g.beginPath(); g.arc(X(b.cx), X(b.cz), 6 * k, 0, 7); g.fill(); }
    }
    if (this.g.world.paintMapExtra) this.g.world.paintMapExtra(g, X, k, view, 'top');
    // lane centre lines (open road segments only)
    g.strokeStyle = 'rgba(255,214,90,0.35)'; g.lineWidth = 1;
    const open = (ax, i, j) => typeof RoadNet === 'undefined' || RoadNet.segOpen(ax, i, j);
    g.beginPath();
    for (let i = 0; i <= N; i++) for (let j = 0; j < N; j++) {
      if (open(0, i, j)) { g.moveTo(X(i * P), X(j * P)); g.lineTo(X(i * P), X((j + 1) * P)); }
      if (open(1, i, j)) { g.moveTo(X(j * P), X(i * P)); g.lineTo(X((j + 1) * P), X(i * P)); }
    }
    g.stroke();
    // Valen Point and its causeway (Session 6B)
    this._paintVP(g, view);
    // district tints and borders
    for (let bz = 0; bz < N; bz++) for (let bx = 0; bx < N; bx++) {
      const key = ZONE_MAP[bz][bx], z = ZONES[key];
      g.fillStyle = z.col; g.globalAlpha = 0.09; g.fillRect(X(bx * P), X(bz * P), P * k, P * k); g.globalAlpha = 1;
      g.strokeStyle = z.col; g.globalAlpha = 0.55; g.lineWidth = 2;
      if (bx === 0 || ZONE_MAP[bz][bx - 1] !== key) { g.beginPath(); g.moveTo(X(bx * P), X(bz * P)); g.lineTo(X(bx * P), X((bz + 1) * P)); g.stroke(); }
      if (bz === 0 || ZONE_MAP[bz - 1][bx] !== key) { g.beginPath(); g.moveTo(X(bx * P), X(bz * P)); g.lineTo(X((bx + 1) * P), X(bz * P)); g.stroke(); }
      g.globalAlpha = 1;
    }
  }
  _bind() {
    const g = this.g;
    document.querySelectorAll('[data-open]').forEach(b => b.addEventListener('click', () => { g.audio.play('ui'); this.open(b.dataset.open); }));
    document.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', () => { g.audio.play('ui'); this.back(); }));
    document.querySelectorAll('.mbtn').forEach(b => b.addEventListener('mouseenter', () => g.audio.play('uiHover')));
    $('btnNew').addEventListener('click', () => {
      if (g.hasSave) this.ask('Start a new game?', 'Your current career — money, upgrades, vehicles and stats — will be erased.', 'Start over', () => g.newGame());
      else g.newGame();
    });
    $('confirmNo').addEventListener('click', () => { g.audio.play('ui'); this.show('confirmScreen', false); this._onYes = null; });
    $('confirmYes').addEventListener('click', () => { g.audio.play('confirm'); this.show('confirmScreen', false); const f = this._onYes; this._onYes = null; if (f) f(); });
    $('btnContinue').addEventListener('click', () => g.continueGame());
    $('btnResume').addEventListener('click', () => g.resume());
    $('btnRetry').addEventListener('click', () => { g.resume(); g.missions.retry(); });
    $('btnQuick').addEventListener('click', () => { g.resume(); g.quickSave(); });
    $('btnQuit').addEventListener('click', () => g.quitToMenu());
    $('btnReset').addEventListener('click', () => this.ask('Erase all data?', 'This deletes your saved career and settings on this device. It cannot be undone.', 'Erase', () => { g.wiped = true; SaveSystem.wipe(); location.reload(); }));
    this.mapView = new MapView(this);
    // settings
    const s = g.save.settings;
    const bindRange = (id, key, fmt, apply) => { const el = $(id), v = $(id + 'V'); el.value = s[key]; v.textContent = fmt(s[key]); el.addEventListener('input', () => { s[key] = parseFloat(el.value); v.textContent = fmt(s[key]); apply && apply(); g.saveGame(); }); };
    const bindToggle = (id, key, apply) => { const el = $(id); el.classList.toggle('on', !!s[key]); el.addEventListener('click', () => { s[key] = !s[key]; el.classList.toggle('on', s[key]); g.audio.play('ui'); apply && apply(); g.saveGame(); }); };
    const pct = v => Math.round(v * 100) + '%';
    bindRange('setFov', 'fov', v => v + '°');
    bindRange('setSens', 'sens', v => v.toFixed(2));
    bindRange('setVol', 'volume', pct, () => g.audio.setVolumes({ master: s.volume }));
    bindRange('setMusic', 'music', pct, () => g.audio.setVolumes({ music: s.music }));
    bindRange('setSfx', 'sfx', pct, () => g.audio.setVolumes({ sfx: s.sfx }));
    bindRange('setDay', 'dayLength', v => v + ' min');
    bindToggle('setPost', 'post', () => g.quality.apply());
    bindToggle('setShadows', 'shadows', () => g.quality.apply());
    bindToggle('setInvert', 'invertY');
    bindToggle('setFps', 'showFps');
    bindToggle('setWeather', 'weather');
    bindToggle('setGuide', 'guide', () => { if (!s.guide && g.tutorial) g.tutorial.hide(); });
    $('btnHitch').addEventListener('click', () => {
      const txt = HitchLog.text(), n = HitchLog.list.length;
      g.audio.play('ui');
      this.ask(`Hitch log · ${n} long frame${n === 1 ? '' : 's'}`, n ? 'Frames over 120 ms this session, with what happened just before. Copy it and send it with a description of what you were doing.' : 'No frame over 120 ms so far this session.', n ? 'Copy' : 'OK', () => { try { navigator.clipboard.writeText(txt).then(() => this.toast('Hitch log copied.'), () => this.toast('Copy failed: the log is in the browser console.')); } catch { this.toast('Copy failed: the log is in the browser console.'); } console.info(txt); });
    });
    $('btnTips').addEventListener('click', () => { g.tutorial.reset(); s.guide = true; $('setGuide').classList.add('on'); g.audio.play('ui'); g.saveGame(); this.toast('Tips will show again as you play.'); });
    bindRange('setTraffic', 'traffic', pct);
    bindRange('setPeds', 'peds', pct);
    const aa = $('setAssist'); aa.value = String(s.aimAssist);
    aa.addEventListener('change', () => { s.aimAssist = clamp(parseInt(aa.value, 10) || 0, 0, 3); g.saveGame(); });
    const q = $('setQuality'); q.value = String(s.quality);
    q.addEventListener('change', () => { s.quality = q.value === 'auto' ? 'auto' : parseInt(q.value, 10); g.quality.setMode(s.quality); g.saveGame(); });
  }
  show(id, on = true) { $(id).classList.toggle('hidden', !on); }
  // returns true if a confirm dialog was open (and is now dismissed without acting)
  closeConfirm() { if ($('confirmScreen').classList.contains('hidden')) return false; this.show('confirmScreen', false); this._onYes = null; return true; }
  ask(title, text, yes, onYes) {
    $('confirmTitle').textContent = title; $('confirmText').textContent = text; $('confirmYes').textContent = yes;
    this._onYes = onYes; this.show('confirmScreen', true); $('confirmNo').focus();
  }
  open(name) {
    const map = { settings: 'settingsScreen', controls: 'controlsScreen', stats: 'statsScreen', shop: 'shopScreen', svc: 'svcScreen', phone: 'phoneScreen', progress: 'progressScreen', empire: 'empireScreen' };
    const id = map[name]; if (!id) return;
    if (name === 'empire') { if (this.stack.includes(id)) return; this.g.uw.ui.render(); }
    if (name === 'phone') this.g.content.renderPhone();
    if (name === 'progress') this.g.content.renderProgress();
    if (name === 'stats') this.renderStats();
    if (name === 'shop') this.renderShop();
    this.stack.push(id); this.show(id, true); this.modal = id;
    this.g.input.releaseAll();
  }
  back() {
    const id = this.stack.pop(); if (id) this.show(id, false);
    if (id === 'svcScreen' && this.g.content._svcClose) { const f = this.g.content._svcClose; this.g.content._svcClose = null; f(); }
    this.modal = this.stack.length ? this.stack[this.stack.length - 1] : null;
    if ((id === 'svcScreen' || id === 'progressScreen' || id === 'empireScreen') && this.g.state === 'playing' && !this.modal) this.g.relock();
  }
  closeAll() { while (this.stack.length) this.back(); }
  toast(msg, type = '') {
    const el = document.createElement('div'); el.className = 'toast ' + type; el.textContent = msg;
    this.toasts.appendChild(el);
    while (this.toasts.children.length > 4) this.toasts.firstChild.remove();
    setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 450); }, type === 'radio' ? 5200 : 3800);
  }
  banner(title, sub, cls = 'pass', dur = 3) {
    const b = $('banner'); b.className = cls; b.querySelector('.bt').textContent = title; b.querySelector('.bs').textContent = sub || '';
    const bt = b.querySelector('.bt'); bt.style.animation = 'none'; void bt.offsetWidth; bt.style.animation = '';
    this.bannerUntil = performance.now() + dur * 1000; this.show('banner', true);
  }
  hurtFlash(k) { const f = $('flash'); f.style.transition = 'none'; f.style.opacity = clamp(k, 0.2, 0.9); void f.offsetWidth; f.style.transition = 'opacity .6s'; f.style.opacity = 0; }
  hitMarker(kind) {
    const c = $('crosshair'); c.classList.add('hit'); clearTimeout(this._hm); this._hm = setTimeout(() => c.classList.remove('hit'), 120);
    const h = $('hitmark'); h.className = ''; void h.offsetWidth; h.className = 'on' + (kind === 'head' ? ' head' : kind === 'kill' ? ' kill' : '');
  }
  // reticle + gun HUD: ticks open with the real spread (projected to pixels), red over an enemy
  updateGunHud() {
    const g = this.g, p = g.player, inp = g.input, cmb = g.combat;
    const gun = p.state === 'foot' && !p.wep.melee && (g.state === 'playing');
    if (gun !== this._gun) { this._gun = gun; document.body.classList.toggle('gunmode', gun); }
    const show = gun && (inp.usingTouch || inp.locked || p.aiming || inp.gp.active || IS_TOUCH);
    if (show !== this._xhShow) { this._xhShow = show; this.show('crosshair', show); }
    if (!gun) { if (this._rl) { this._rl = false; this.show('reloadRing', false); } return; }
    const w = p.wep;
    if (show) {
      const H = this.layout.vh || window.innerHeight;
      const f = (H / 2) / Math.tan(g.camera.fov * Math.PI / 360);
      const gap = clamp(Math.tan(cmb.spreadOf(w)) * f, 3, 60);
      if (Math.abs(gap - (this._gap || 0)) > 0.4) { this._gap = gap; $('crosshair').style.setProperty('--g', gap.toFixed(1) + 'px'); }
      const a = cmb.assist, enemy = !!(a && a.ang < a.cone * 0.6 && (a.c.kind !== 'civ'));
      if (enemy !== this._xhE) { this._xhE = enemy; $('crosshair').classList.toggle('enemy', enemy); }
      if (p.ads !== this._xhA) { this._xhA = p.ads; $('crosshair').classList.toggle('ads', !!p.ads); }
    }
    const rl = p.reloadT > 0;
    if (rl !== this._rl) { this._rl = rl; this.show('reloadRing', rl); }
    if (rl) $('reloadArc').setAttribute('stroke-dasharray', `${clamp(1 - p.reloadT / (p.reloadDur || 1), 0, 1) * 100} 100`);
    const ammo = `${p.mag[w.id] || 0} / ${g.save.ammo[w.id] | 0}`;
    if (ammo !== this._ammo) { this._ammo = ammo; $('fireAmmo').textContent = ammo; }
    // contextual melee: somebody hostile within arm's reach
    let near = false;
    if (IS_TOUCH) for (const c of cmb.targets()) { if (c.state === 'down' || c.friendly) continue; if (dist2(c.x, c.z, p.pos.x, p.pos.z) < 2.3 * 2.3) { near = true; break; } }
    if (near !== this._mel) { this._mel = near; this.show('meleeBtn', near); }
  }
  showOffer(o) {
    const el = $('offer');
    const key = IS_TOUCH ? 'USE' : 'E';
    const chip = o.chip ? `<span class="ochip${o.type === 'story' ? ' story' : ''}">${o.chip}</span>` : '';
    const foot = o.locked ? `<div class="of locked"><span>\u{1F512} ${o.locked}</span></div>` : `<div class="of"><span><kbd style="background:var(--amber);color:#1a1206;border-radius:5px;padding:1px 7px;font-weight:900">${key}</kbd> accept</span><span>${o.reward ? `Reward <b>${fmtMoney(o.reward)}</b>` : o.type === 'story' ? 'Reward <b>a car</b>' : ''}</span></div>`;
    el.innerHTML = `${chip}<div class="oc">${o.contact.name} · ${o.contact.role}</div><div class="on">${o.title}</div><div class="od">${o.desc}</div>${foot}`;
    el.classList.toggle('story', o.type === 'story');
    el.classList.remove('hidden');
  }
  hideOffer() { $('offer').classList.add('hidden'); }
  setObjective(text, timer, guide) {
    const el = $('objective');
    if (!text) { el.classList.add('hidden'); return; }
    el.classList.remove('hidden');
    el.classList.toggle('guide', !!guide);
    const ot = el.querySelector('.ot'); if (ot.textContent !== text) ot.textContent = text;
    const tm = el.querySelector('.otm');
    if (timer !== null && timer !== undefined) { tm.classList.remove('hidden'); tm.textContent = fmtTime(Math.ceil(timer)); tm.classList.toggle('warn', timer < 10); }
    else tm.classList.add('hidden');
  }
  prompt(text) {
    const el = $('prompt');
    if (!text) { el.classList.add('hidden'); this._prompt = null; return; }
    if (this._prompt !== text) { el.innerHTML = `<kbd>${IS_TOUCH && this.g.input.usingTouch ? 'USE' : 'E'}</kbd>${text}`; this._prompt = text; }
    el.classList.remove('hidden');
  }
  toggleMap(force) { this.mapView.toggle(force); }
  fitBigMap() { this.mapView.fit(); }
  renderStats() {
    const s = this.g.save.stats;
    const rows = [
      ['Time played', `${Math.floor(s.playTime / 3600)}h ${Math.floor(s.playTime / 60) % 60}m ${Math.floor(s.playTime % 60)}s`],
      ['Jobs passed', s.missionsPassed], ['Jobs failed', s.missionsFailed], ['Money earned', fmtMoney(s.earned)],
      ['Distance driven', (s.distDrive / 1000).toFixed(1) + ' km'], ['Distance on foot', (s.distFoot / 1000).toFixed(2) + ' km'],
      ['Top speed', Math.round(s.topSpeed * 3.6) + ' km/h'], ['Vehicles stolen', s.stolen], ['Crashes', s.crashes],
      ['Highest wanted level', '★'.repeat(s.maxWanted) || '—'], ['Times arrested', s.busted], ['Times hospitalized', s.wasted],
      ['Pedestrians bumped', s.pedsHit], ['Police cars wrecked', s.copsWrecked], ['Shots fired', s.shots],
      ['Contracts done', s.sideDone], ['Underground races won', s.racesWon + ' of ' + s.racesEntered],
      ['Stunt jumps', s.stuntJumps], ['Longest jump', Math.round(s.bestJump) + ' m'], ['Most air time', s.bestAir.toFixed(1) + ' s'],
      ['Best drift', s.bestDrift.toLocaleString('en-US')], ['Near misses', s.nearMisses], ['Police escapes', s.escapes],
      ['Street events helped', s.eventsDone], ['Hidden packages', (s.packagesFound || 0) + ' / 30'], ['Cabs taken', s.fastTravels],
      ['Repairs', s.repairs], ['Cars bought', s.carsBought], ['Money spent', fmtMoney(s.spent)]
    ];
    $('statsList').innerHTML = rows.map(([a, b]) => `<span>${a}</span><span>${b}</span>`).join('');
    const best = this.g.save.best;
    const names = { race: 'Fastest race', delivery: 'Fastest delivery', courier: 'Fastest courier run' };
    const br = Object.keys(names).map(k => `<span>${names[k]}</span><span>${best[k] ? fmtTime(best[k]) + '.' + Math.round((best[k] % 1) * 10) : '—'}</span>`);
    $('bestList').innerHTML = br.join('');
  }
  renderShop() {
    const g = this.g, s = g.save;
    $('shopMoney').textContent = fmtMoney(Money.clean);
    $('shopUp').innerHTML = UPGRADES.map(u => {
      const lvl = s.upgrades[u.id] || 0, max = lvl >= u.prices.length, price = max ? 0 : u.prices[lvl];
      return `<div class="card"><div class="t">${u.name}</div><div class="d">${u.desc}</div><div class="pips">${u.prices.map((_, i) => `<i class="${i < lvl ? 'on' : ''}"></i>`).join('')}</div><button class="sbtn gold" data-buy="up:${u.id}" ${max || !Money.can(price, 'training') ? 'disabled' : ''}>${max ? 'Maxed' : fmtMoney(price)}</button></div>`;
    }).join('');
    document.querySelectorAll('#shopScreen [data-buy]').forEach(b => b.addEventListener('click', () => this.buy(b.dataset.buy)));
  }
  buy(key) {
    const g = this.g, s = g.save, [kind, id] = key.split(':');
    let price = 0;
    if (kind !== 'up') return;
    const u = UPGRADES.find(x => x.id === id); price = u && u.prices[s.upgrades[id] || 0];
    if (price === undefined || !Money.pay(price, 'training')) return;
    s.upgrades[id] = (s.upgrades[id] || 0) + 1; if (id === 'health') g.player.health = g.player.maxHealth;
    g.audio.play('cash'); g.saveGame(); this.renderShop();
  }
  // --------- per-frame HUD ---------
  // one line in the +/- money feed (new lines on top, at most four, each shown ~2 s)
  moneyPop(e, merged) {
    const box = $('moneyFeed'); if (!box) return;
    // cash on you shows as "+$250"; the bank as "+$250 bank"
    const txt = (e.d > 0 ? '+' : '−') + fmtMoney(Math.abs(Math.round(e.d))) + (e.cur === 'clean' ? ' bank' : '');
    const cls = (e.d > 0 ? 'up' : 'dn') + (Math.abs(e.d) >= 10000 ? ' big' : '') + (e.cur === 'clean' ? ' bank' : '');
    if (merged && e.el) { e.el.textContent = txt; e.el.className = cls; e.ttl = 2.2; return; }
    const el = document.createElement('b'); el.className = cls; el.textContent = txt;
    e.el = el; e.ttl = 2.2;
    box.prepend(el); this.feed.unshift(e);
    while (this.feed.length > 4) { const o = this.feed.pop(); if (o.el) o.el.remove(); }
    this.placeFeed();
  }
  // under the money / wanted / clock cluster when the HUD is up, else the top-right corner (menus)
  placeFeed() {
    const box = $('moneyFeed'), tr = document.querySelector('#hud .tr');
    const hudUp = !this.hud.classList.contains('hidden') && !this.modal && !this.g.mapOpen;
    const r = hudUp && tr ? tr.getBoundingClientRect() : null;
    const top = r && r.height > 0 ? Math.round(r.bottom + 4) + 'px' : 'calc(10px + var(--safe-t))';
    if (box.style.top !== top) box.style.top = top;
    box.classList.toggle('on', this.feed.length > 0);
  }
  tickFeed(dt) {
    if (!this.feed.length) return;
    for (let i = this.feed.length - 1; i >= 0; i--) {
      const e = this.feed[i]; e.ttl -= dt;
      if (e.ttl <= 0.35 && e.el && !e.el.classList.contains('out')) e.el.classList.add('out');
      if (e.ttl <= 0) { if (e.el) e.el.remove(); this.feed.splice(i, 1); if (MoneyFeed.last === e) MoneyFeed.last = null; }
    }
    if (!this.feed.length) $('moneyFeed').classList.remove('on');
  }
  update(dt) {
    const g = this.g, p = g.player, s = g.save;
    this.tickFeed(dt);
    if (this.bannerUntil && performance.now() > this.bannerUntil) { this.bannerUntil = 0; this.show('banner', false); }
    if (g.state !== 'playing' && g.state !== 'dead' && g.state !== 'busted') return;
    // money: Dirty Cash on you (what an arrest would take) and the bank
    const m = Math.floor(Money.onMe);
    if (m !== this.lastMoney) { const el = $('money'); el.textContent = fmtMoney(m); if (this.lastMoney >= 0 && m > this.lastMoney) { el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash'); } this.lastMoney = m; }
    const bk = Math.floor(Money.clean) + '/' + Math.floor(Money.debt);
    if (bk !== this.lastBank) { this.lastBank = bk; $('bank').textContent = `BANK ${fmtMoney(Money.clean)}${Money.debt > 0 ? ' · DEBT ' + fmtMoney(Money.debt) : ''}`; $('bank').classList.toggle('debt', Money.debt > 0); }
    // health ring
    $('hpArc').setAttribute('stroke-dasharray', `${clamp(p.health / p.maxHealth, 0, 1) * 100} 100`);
    const low = p.health / p.maxHealth < 0.3;
    $('hpArc').setAttribute('stroke', low ? '#ff4d5e' : '#6fe08a');
    if (low !== this._low) { this._low = low; $('minimapWrap').classList.toggle('low', low); $('lowHp').classList.toggle('hidden', !low); }
    $('stArc').setAttribute('stroke-dasharray', `${p.stamina * 100} 100`);
    $('stArc').setAttribute('stroke', p.boostT > 0 ? '#ffd84d' : '#46d4c4');
    const vs = Math.round(clamp(p.vest / VEST_MAX, 0, 1) * 300) / 10; if (vs !== this._vs) { this._vs = vs; $('vsArc').setAttribute('stroke-dasharray', `${vs} 100`); }
    // stars
    const stars = $('stars').children, lvl = g.police.level;
    for (let i = 0; i < 5; i++) stars[i].classList.toggle('on', i < lvl);
    $('stars').classList.toggle('evade', lvl > 0 && !g.police.visible);
    this.hudT -= dt;
    if (this.hudT <= 0) {
      this.hudT = 0.25;
      $('clockT').textContent = g.env.timeString();
      $('clockW').textContent = ({ clear: g.env.night > 0.5 ? '☾ Clear' : '☀ Clear', cloudy: '☁ Cloudy', rain: '☂ Rain', heavy: '☔ Storm', fog: '≋ Fog' }[g.env.weather] || '') + (isRushHour(g.env.time) ? ' · Rush hour' : '');
      const w = p.wep;
      $('wName').textContent = w.name;
      const wb = $('wpnBtn'), wl = w.melee ? (w.id === 'fists' ? 'Wpn' : 'Bat') : w.id === 'smg' ? 'SMG' : w.id === 'shotgun' ? 'Shot' : 'Pistol';
      if (wb.textContent !== wl) wb.textContent = wl;
      $('wAmmo').innerHTML = w.melee ? '' : `${p.mag[w.id] || 0}<small> / ${s.ammo[w.id]}</small>${p.reloadT > 0 ? ' <small>reloading</small>' : ''}`;
      if (s.settings.showFps) $('clockW').textContent += ' · ' + Math.round(g.fps) + ' fps';
    }
    this.zoneT -= dt;
    if (this.zoneT === undefined || isNaN(this.zoneT) || this.zoneT <= 0) {
      this.zoneT = 0.5;
      const dn = districtNameAt(p.pos.x, p.pos.z), sn = streetNameAt(p.pos.x, p.pos.z);
      const z = $('zone');
      if (dn !== this._dn || (sn && sn !== this._sn && !sn.includes('&'))) {
        const changedD = dn !== this._dn;
        this._dn = dn; if (sn) this._sn = sn;
        z.innerHTML = (changedD ? dn : (sn || dn)) + `<small>${changedD ? (sn || 'Port Valen') : dn}</small>`;
        z.classList.add('show'); clearTimeout(this._zt); this._zt = setTimeout(() => z.classList.remove('show'), 3200);
      }
    }
    const pv = p.state === 'vehicle' ? p.vehicle : null;
    this.show('speedo', !!pv);
    document.body.classList.toggle('driving', !!pv);
    if (pv) {
      $('spd').textContent = Math.round(pv.speed * 3.6);
      $('gear').textContent = pv.gear < 0 ? 'R' : pv.speed < 0.5 ? 'N' : pv.gear;
      const vs = vehStage(pv.health);
      const vn = pv.spec.name + (vs[1] !== 'NORMAL' ? ' · ' + vs[1] : '');
      if ($('vehName').textContent !== vn) { $('vehName').textContent = vn; $('vehName').style.color = vs[1] === 'NORMAL' ? '' : vs[2]; }
      const own = p.passenger ? ['TAXI', '#f4c20d'] : pv.mission === 'story' || pv.mission === 'race' ? ['MISSION', '#ffd84d'] : pv.garageUid ? (VEHICLES[pv.type].special ? ['SPECIAL', '#d28cff'] : ORIGIN_CHIP[pv.origin] || ORIGIN_CHIP.bought) : pv.type === 'police' ? ['POLICE', '#4d8dff'] : pv.fac ? ['FACTION', FACTIONS[pv.fac] ? FACTIONS[pv.fac].col : '#d28cff'] : pv.origin === 'found' ? ORIGIN_CHIP.found : ['STOLEN', '#ff4d5e'];
      const vo = $('vehOwn'); if (vo.textContent !== own[0]) { vo.textContent = own[0]; vo.style.background = own[1]; }
      $('vhp').style.width = clamp(pv.health, 0, 100) + '%';
    }
    this.updateGunHud();
    const bb = $('bustbar'); bb.classList.toggle('hidden', g.police.bust <= 0.01); bb.querySelector('i').style.width = (g.police.bust * 100) + '%';
    this.updateObjArrow();
    this.layout.tick(dt);
    if (g.mapOpen) this.mapView.tick(dt);
    this.mmT -= dt;
    if (this.mmT <= 0) { this.mmT = 1 / 30; this.drawMinimap(); }
  }
  updateObjArrow() {
    const g = this.g, m = g.missions.active, el = $('objArrow');
    const t = (m && m.target) || (!m && g.content && g.content.guideArrow ? g.content.guideTarget : null);
    if (!t) { el.classList.add('hidden'); return; }
    const v = new THREE.Vector3(t.x, groundY(t.x, t.z) + 2, t.z).project(g.camera);
    const behind = v.z > 1;
    let x = v.x, y = v.y;
    if (behind) { x = -x; y = -y; }
    const onScreen = !behind && Math.abs(x) < 0.92 && Math.abs(y) < 0.88;
    const W = window.innerWidth, H = window.innerHeight;
    let ang;
    if (onScreen) { ang = Math.PI; }
    else { const l = Math.max(Math.abs(x) / 0.9, Math.abs(y) / 0.85); x /= l; y /= l; ang = Math.atan2(x, y); }
    el.classList.remove('hidden');
    el.style.transform = `translate(${(x * 0.5 + 0.5) * W}px, ${(-y * 0.5 + 0.5) * H}px)`;
    el.querySelector('svg').style.transform = `rotate(${onScreen ? 180 : ang * 180 / Math.PI}deg)`;
    const d = Math.hypot(t.x - g.player.pos.x, t.z - g.player.pos.z);
    el.querySelector('span').textContent = d > 1000 ? (d / 1000).toFixed(1) + ' km' : Math.round(d) + ' m';
    el.classList.toggle('guide', !m);
  }
  _mapXY(x, z) { return [(x + this.mapE) * this.mapK, (z + this.mapE) * this.mapK]; }
  drawMinimap() {
    const g = this.g, c = this.mmc, W = this.mm.width, R = W / 2, p = g.player;
    const pv = p.state === 'vehicle' ? p.vehicle : null;
    const zoom = (pv ? clamp(1.5 - pv.speed * 0.012, 0.85, 1.5) : 1.9) * (W / 380);
    const rot = g.cam.yaw + Math.PI;
    c.save();
    c.clearRect(0, 0, W, W);
    c.beginPath(); c.arc(R, R, R, 0, Math.PI * 2); c.clip();
    c.fillStyle = '#0f2b3a'; c.fillRect(0, 0, W, W);
    c.translate(R, R); c.rotate(rot); c.scale(zoom / this.mapK, zoom / this.mapK);
    const [px, pz] = this._mapXY(p.pos.x, p.pos.z);
    c.translate(-px, -pz);
    c.drawImage(this.mmImg, 0, 0);
    if (this.vpImg) c.drawImage(this.vpImg.img, this.vpImg.x, this.vpImg.z);
    const k = this.mapK;
    // GPS route
    const m = g.missions.active;
    const gt = (m && m.target) || (!m && g.content ? g.content.guideTarget : null) || (g.events && g.events.ev && g.events.ev.ride ? g.events.ev.ride.dest : null);
    if (gt) {
      const route = gpsRoute(p.pos.x, p.pos.z, gt.x, gt.z);
      c.strokeStyle = m ? 'rgba(255,216,77,0.85)' : 'rgba(127,224,143,0.8)'; c.lineWidth = 5 * k * 1.2; c.lineJoin = 'round';
      c.beginPath(); route.forEach((q, i) => { const [x, z] = this._mapXY(q.x, q.z); i ? c.lineTo(x, z) : c.moveTo(x, z); }); c.stroke();
    }
    if (m && m.area) { const [ax, az] = this._mapXY(m.area.x, m.area.z); c.fillStyle = 'rgba(255,216,77,0.18)'; c.strokeStyle = 'rgba(255,216,77,0.8)'; c.lineWidth = 2 / zoom * k; c.beginPath(); c.arc(ax, az, m.area.r * k, 0, 7); c.fill(); c.stroke(); }
    if (g.police.level > 0 && !g.police.visible) { const [sx, sz] = this._mapXY(g.police.lastSeen.x, g.police.lastSeen.z); c.fillStyle = 'rgba(255,60,80,0.15)'; c.beginPath(); c.arc(sx, sz, g.police.searchRadius * k, 0, 7); c.fill(); }
    c.restore();
    // map labels drawn upright whichever way the map has turned
    {
      const sc = zoom / this.mapK, cr = Math.cos(rot), sr = Math.sin(rot), fs = W / 380;
      c.save(); c.beginPath(); c.arc(R, R, R, 0, Math.PI * 2); c.clip(); c.textAlign = 'center';
      for (const L of this.mmImg.labels) {
        const dx = (L.x - px) * sc, dz = (L.z - pz) * sc, x = R + dx * cr - dz * sr, y = R + dx * sr + dz * cr;
        if (x < -150 || x > W + 150 || y < -40 || y > W + 40) continue;
        c.font = L.big ? `bold ${Math.round(17 * fs)}px Arial` : `bold ${Math.round(12 * fs)}px Arial`;
        if (L.big) { c.fillStyle = 'rgba(0,0,0,0.55)'; c.fillText(L.t, x + 1.5, y + 1.5); }
        c.fillStyle = L.col; c.fillText(L.t, x, y);
      }
      c.restore();
    }
    // blips (screen space)
    const toMM = (x, z) => {
      const dx = (x - p.pos.x) * zoom, dz = (z - p.pos.z) * zoom;
      const cr = Math.cos(rot), sr = Math.sin(rot);
      return [R + dx * cr - dz * sr, R + dx * sr + dz * cr];
    };
    const blip = (x, z, col, size = 5, clampEdge = false, shape = 'dot') => {
      let [bx, bz] = toMM(x, z);
      const dx = bx - R, dz = bz - R, d = Math.hypot(dx, dz);
      if (d > R - size - 2) { if (!clampEdge) return; bx = R + dx / d * (R - size - 2); bz = R + dz / d * (R - size - 2); }
      c.fillStyle = col; c.strokeStyle = 'rgba(0,0,0,0.7)'; c.lineWidth = 2;
      c.beginPath();
      if (shape === 'sq') c.rect(bx - size, bz - size, size * 2, size * 2); else c.arc(bx, bz, size, 0, 7);
      c.fill(); c.stroke();
    };
    const t = g.time;
    for (const u of g.police.units) if (!u.v.burnt) blip(u.v.pos.x, u.v.pos.z, Math.sin(t * 12) > 0 ? '#ff4d5e' : '#4d8dff', 5);
    for (const v of g.traffic.cars) if (v.patrol) blip(v.pos.x, v.pos.z, '#4d8dff', 4);
    for (const cp of g.police.cops) blip(cp.x, cp.z, '#ff4d5e', 3);
    if (g.police.heli.active) blip(g.police.heli.x, g.police.heli.z, '#ff4d5e', 6, true, 'sq');
    if (!m) for (const ct of g.missions.contacts) if (ct.marker.g.visible) blip(ct.x, ct.z, ct._story ? '#ffd84d' : '#' + new THREE.Color(ct.color).getHexString(), ct._story ? 8 : 6, ct._story);
    const uw = g.uw;
    // the same badges as the big map for the places you navigate by
    const badge = (x, z, col, icon, r, clampEdge) => {
      let [bx, bz] = toMM(x, z); const dx = bx - R, dz = bz - R, d = Math.hypot(dx, dz);
      if (d > R - r - 3) { if (!clampEdge) return; bx = R + dx / d * (R - r - 3); bz = R + dz / d * (R - r - 3); }
      drawMapBadge(c, bx, bz, r, col, icon); return [bx, bz];
    };
    const bs = 9 * (W / 380) * 1.6;
    { const cs = g.world.places.chopshop, pd = g.world.places.police.door; if (cs) badge(cs.door.x, cs.door.z, MAP_CATS.chop.col, 'C', bs, false); badge(pd.x, pd.z, MAP_CATS.police.col, 'P', bs, false); }
    for (const L of uw.locs) {
      if (L.kind === 'prop') { if (uw.props.owned(L.id)) badge(L.x, L.z, '#8fe39b', L.def.kind === 'business' ? 'B' : L.def.kind === 'garage' ? 'G' : L.def.kind === 'motorsport' ? 'M' : 'H', bs, L.def.kind === 'safehouse'); else blip(L.x, L.z, '#e8eef6', 3, false, 'sq'); }
      else if (L.kind === 'hq' && !uw.S.factions[L.id].broken) blip(L.x, L.z, FACTIONS[L.id].col, 5, false, 'sq');
      else if (L.kind === 'spot') blip(L.x, L.z, '#' + new THREE.Color(L.col).getHexString(), 4, false, 'sq');
    }
    for (const m of uw.gangs.blips()) blip(m.x, m.z, m.kind === 'crew' ? '#ffb547' : (m.group && m.group.hostile ? '#ff4d5e' : FACTIONS[m.fac] ? FACTIONS[m.fac].col : '#aaa'), m.kind === 'crew' ? 3.5 : 3);
    for (const gr of uw.gangs.groups.values()) if (gr.kind === 'buy' && gr.members.length) blip(gr.x, gr.z, '#d28cff', 4);
    for (const o of uw.opps.active()) if (o.x !== undefined && !o.taken) blip(o.x, o.z, o.urgent ? '#ff4d5e' : '#d28cff', 5, true);
    // nearby services and hinted packages
    const svc = g.world.places;
    for (const id of ['motorworks', 'dealer', 'store', 'police']) if (g.save.discovered.places[id]) blip(svc[id].door.x, svc[id].door.z, '#e8eef6', 4, false, 'sq');
    // every Fuel & Go is on the minimap (public, signposted, 24 hours)
    for (const id of ['store', 'store2', 'store3', 'store4', 'store5']) if (svc[id]) blip(svc[id].door.x, svc[id].door.z, '#ffd84d', 3.5, false, 'sq');
    for (const pk of g.world.packages) if (g.save.hints[pk.id] && !g.save.packages[pk.id]) blip(pk.x, pk.z, '#7fe08f', 4);
    if (g.events && g.events.ev && !m && !g.events.ev.done) blip(g.events.ev.x, g.events.ev.z, '#e8eef6', 4.5, false);
    if (!m && g.content && g.content.guideTarget) { const gt2 = g.content.guideTarget; if (gt2.icon) { const at = badge(gt2.x, gt2.z, gt2.col || '#7fe08f', gt2.icon, bs * 1.25, true); if (at) { c.strokeStyle = '#7fe08f'; c.lineWidth = 3; c.beginPath(); c.arc(at[0], at[1], bs * 1.25 + 4, 0, 7); c.stroke(); } } else blip(gt2.x, gt2.z, '#7fe08f', 6, true); }
    if (g.events && g.events.ev && g.events.ev.ride) blip(g.events.ev.ride.dest.x, g.events.ev.ride.dest.z, '#7fe08f', 7, true);
    if (m && m.target) blip(m.target.x, m.target.z, '#ffd84d', 7, true);
    if (m && m.data.car && g.vehicles.list.includes(m.data.car)) blip(m.data.car.pos.x, m.data.car.pos.z, '#ffd84d', 6, true, 'sq');
    // player arrow
    const ah = (pv ? pv.h : p.h) - g.cam.yaw;
    c.save(); c.translate(R, R); c.rotate(-ah);
    c.fillStyle = '#ffb547'; c.strokeStyle = '#1a1206'; c.lineWidth = 2;
    c.beginPath(); c.moveTo(0, -11); c.lineTo(8, 9); c.lineTo(0, 4); c.lineTo(-8, 9); c.closePath(); c.fill(); c.stroke();
    c.restore();
    // north marker
    const [nx, nz] = toMM(p.pos.x, p.pos.z - 1000); const dd = Math.hypot(nx - R, nz - R);
    const ex = R + (nx - R) / dd * (R - 12), ez = R + (nz - R) / dd * (R - 12);
    c.fillStyle = '#fff'; c.font = 'bold 18px Arial'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('N', ex, ez);
  }
  drawBigMap() { this.mapView.dirty = true; this.mapView.draw(); }
}
/* ---------------- City map: zoom, pan, index, layers, tracking ----------------
   One symbol language for the big map, the minimap and the index: every place has a
   category, and a category owns its icon letter and colour. The map is redrawn from vector
   data under a view transform (map space is the 1024-unit square used everywhere else), so it
   stays sharp at any zoom; labels are laid out in screen space with collision avoidance and
   appear as you zoom in. */
const MAP_CATS = {
  landmark: { name: 'Landmarks', icon: '▲', col: '#e8eef6', layer: 'landmarks' },
  service: { name: 'Shops & services', icon: '$', col: '#46d4c4', layer: 'locations' },
  chop: { name: 'Chop shop', icon: 'C', col: '#c9a46b', layer: 'locations' },
  garage: { name: 'Garages & parking', icon: 'G', col: '#7fb2ff', layer: 'garages' },
  home: { name: 'Homes for sale', icon: 'H', col: '#e8eef6', layer: 'properties' },
  owned: { name: 'Your property', icon: 'H', col: '#8fe39b', layer: null },
  business: { name: 'Businesses', icon: 'B', col: '#ffd84d', layer: 'businesses' },
  faction: { name: 'Faction HQs', icon: '♛', col: '#ff4d5e', layer: 'factions' },
  police: { name: 'Police', icon: 'P', col: '#4d8dff', layer: 'police' },
  hospital: { name: 'Hospital', icon: '+', col: '#ff7aa8', layer: 'locations' },
  contact: { name: 'Job contacts', icon: '!', col: '#46d4c4', layer: 'locations' },
  buy: { name: 'Buy product · suppliers', icon: '↓', col: '#46d4c4', layer: 'buy' },
  sell: { name: 'Sell product · buyers', icon: '$', col: '#ffd84d', layer: 'sell' },
  casino: { name: 'Casino', icon: '♦', col: '#ffd84d', layer: 'landmarks' },
  carsUsed: { name: 'Used Autos', icon: 'U', col: '#e0a020', layer: 'locations' },
  carsNew: { name: 'New Cars', icon: 'N', col: '#7fb2ff', layer: 'locations' },
  carsLux: { name: 'Performance & Luxury', icon: '★', col: '#e8d28a', layer: 'locations' }
};
const MAP_LAYERS = [
  ['locations', 'Locations'], ['landmarks', 'Landmarks'], ['properties', 'Properties for sale'], ['businesses', 'Businesses'],
  ['factions', 'Faction HQs'], ['territory', 'Territory'], ['police', 'Police'], ['garages', 'Garages & parking'], ['economy', 'Street prices'],
  ['buy', '↓ Buy product (suppliers)'], ['sell', '$ Sell product (buyers)']
];
const MAP_LAYER_DEFAULT = { locations: true, landmarks: true, properties: false, businesses: false, factions: false, police: false, garages: true, economy: false, buy: true, sell: true };
// centre of each named district (average of its blocks), for map labels and cards
const ZONE_CENTRE = (() => { const acc = {}; for (let bz = 0; bz < N; bz++) for (let bx = 0; bx < N; bx++) { const k = ZONE_MAP[bz][bx], a = acc[k] || (acc[k] = { x: 0, z: 0, n: 0 }); a.x += (bx + 0.5) * P; a.z += (bz + 0.5) * P; a.n++; } for (const k in acc) { acc[k].x /= acc[k].n; acc[k].z /= acc[k].n; } return acc; })();
// the street good paying furthest over its base price in a district right now
function econBest(uw, z) { let best = null; for (const k of GOOD_IDS) { if (GOODS[k].fence || GOODS[k].arms || !DEMAND[z]) continue; const r = uw.market.ratio(z, k); if (!best || r > best.r) best = { k, r, price: uw.market.price(z, k) }; } return best; }
// draw one map badge (rounded square, letter) at screen position x,y with size r (half side)
function drawMapBadge(c, x, y, r, col, icon, ring) {
  c.beginPath();
  if (c.roundRect) c.roundRect(x - r, y - r, r * 2, r * 2, r * 0.35); else c.rect(x - r, y - r, r * 2, r * 2);
  c.fillStyle = col; c.fill(); c.lineWidth = Math.max(1.5, r * 0.16); c.strokeStyle = ring || 'rgba(0,0,0,0.75)'; c.stroke();
  c.fillStyle = '#111'; c.font = `900 ${Math.round(r * 1.25)}px Arial, sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle';
  c.fillText(icon, x, y + r * 0.06);
}
class MapView {
  constructor(ui) {
    this.ui = ui; this.g = ui.g;
    this.cv = $('bigmapCanvas'); this.c = this.cv.getContext('2d');
    this.zoom = 1; this.cx = 512; this.cz = 512; this.tz = 1; this.tcx = 512; this.tcz = 512;
    this.dpr = 1; this.W = 1; this.H = 1; this.dirty = true; this.refreshT = 0;
    this.ptrs = new Map(); this.sel = null; this.entries = []; this.hl = 0; this.cat = 'all';
    this._bind();
  }
  get layers() { const s = this.g.save.settings; if (!s.mapLayers || typeof s.mapLayers !== 'object') s.mapLayers = { ...MAP_LAYER_DEFAULT }; return s.mapLayers; }
  layerOn(id) { if (id === 'territory') return !!(this.g.uw && this.g.uw.mapOverlay); if (id === null) return true; const L = this.layers; return L[id] !== undefined ? !!L[id] : !!MAP_LAYER_DEFAULT[id]; }
  setLayer(id, on) { if (id === 'territory') { this.g.uw.ui.toggleOverlay(on); } else { this.layers[id] = on; this.g.saveGame(); } this.dirty = true; }
  // ---------------------------------------------------------------- registry
  buildIndex() {
    const g = this.g, w = g.world, pl = w.places, uw = g.uw, out = [], seen = new Set();
    const add = (e) => { if (!e || !isFinite(e.x) || !isFinite(e.z) || seen.has(e.key)) return; seen.add(e.key); const C2 = MAP_CATS[e.cat]; e.icon = e.icon || C2.icon; e.col = e.col || C2.col; e.district = e.district || districtNameAt(e.x, e.z); out.push(e); };
    const P2 = (id) => pl[id] && pl[id].door;
    const svc = { motorworks: ['W', 'Repairs, tuning and respray'], store: ['$', 'Fuel & Go · snacks, vests, scratch cards, slot'], mall: ['M', 'Shopping mall'] };
    for (const id of ['store2', 'store3', 'store4', 'store5']) svc[id] = ['$', 'Fuel & Go · snacks, vests, scratch cards, slot'];
    for (const id in svc) if (P2(id)) add({ key: 'pl:' + id, name: pl[id].name, cat: id === 'mall' ? 'landmark' : 'service', icon: svc[id][0], sub: svc[id][1], x: pl[id].door.x, z: pl[id].door.z, place: id });
    if (P2('chopshop')) add({ key: 'pl:chopshop', name: pl.chopshop.name, cat: 'chop', sub: 'Sells stolen cars · drive in and park', x: pl.chopshop.door.x, z: pl.chopshop.door.z, place: 'chopshop' });
    if (P2('police')) add({ key: 'pl:police', name: pl.police.name, cat: 'police', sub: 'Lobby, tip line board, front desk', x: pl.police.door.x, z: pl.police.door.z, place: 'police' });
    if (P2('hospital')) add({ key: 'pl:hospital', name: pl.hospital.name, cat: 'hospital', sub: 'Where you wake up after a bad night', x: pl.hospital.door.x, z: pl.hospital.door.z, place: 'hospital' });
    // landmark blocks and any generator-registered places
    for (const mp of w.mapPlaces || []) add({ ...mp, key: 'mp:' + mp.id });
    for (const key in LANDMARK_BLOCKS) {
      const L = LANDMARK_BLOCKS[key], [bx, bz] = key.split(',').map(Number), b = w.block(bx, bz);
      const id = Object.keys(pl).find(k => pl[k].name === L.name);
      const d = id ? pl[id].door : { x: b.cx, z: b.cz };
      if (id && seen.has('pl:' + id)) continue;
      add({ key: 'lm:' + key, name: L.name, cat: L.mapCat || (L.icon === 'P' ? 'garage' : 'landmark'), icon: L.icon === 'P' ? 'G' : L.icon === 'G' ? '$' : L.icon === 'T' ? '▲' : L.icon, x: d.x, z: d.z, place: id, sub: L.sub || '' });
    }
    // property, street contacts, faction HQs
    if (uw) for (const L of uw.locs) {
      if (L.kind === 'prop') {
        const d = L.def, own = uw.props.owned(d.id);
        const cat = own ? 'owned' : d.kind === 'business' ? 'business' : d.kind === 'garage' || d.kind === 'warehouse' ? 'garage' : 'home';
        add({ key: 'prop:' + d.id, name: d.name, cat, icon: d.kind === 'business' ? 'B' : d.kind === 'garage' ? 'G' : d.kind === 'warehouse' ? 'W' : d.kind === 'motorsport' ? 'M' : 'H', col: own ? '#8fe39b' : undefined, x: L.x, z: L.z, prop: d, sub: own ? 'Yours' : fmtMoney(uw.props.price(d)) });
      } else if (L.kind === 'spot') {
        // suppliers are BUY points (teal ↓); the armorer sells guns and hardware and buys hardware back
        if (L.def.chop) add({ key: 'spot:' + L.id, name: L.def.name, cat: 'chop', icon: 'C', x: L.x, z: L.z, sub: L.def.role });
        else if (L.def.fixer) add({ key: 'spot:' + L.id, name: L.def.name, cat: 'contact', icon: 'L', x: L.x, z: L.z, sub: `Launders cash: ${Math.round(FIXER_FEE * 100)}% fee, up to ${fmtMoney(FIXER_DAY_CAP)} a day` });
        else add({ key: 'spot:' + L.id, name: L.def.name, cat: 'buy', icon: L.def.arms ? 'A' : '↓', x: L.x, z: L.z, sub: `BUY ${L.def.sells.map(k => GOODS[k].name).join(', ')}${L.def.arms ? ' · guns · also buys hardware' : ''}${g.save.rep < (L.def.rep || 0) ? ` · deals from ${L.def.rep} rep` : ''}` });
      }
      else if (L.kind === 'hq' && !uw.S.factions[L.id].broken) add({ key: 'hq:' + L.id, name: FACTIONS[L.id].name + ' HQ', cat: 'faction', col: FACTIONS[L.id].col, x: L.x, z: L.z, sub: FACTIONS[L.id].archetype });
    }
    if (uw) {
      const p = g.player.pos;
      for (const z of Object.keys(DEMAND)) {
        if (!g.save.discovered.zones[z]) continue;
        const turfs = uw.T.filter(t => t.zone === z); if (!turfs.length) continue;
        let best = turfs[0], bd = 1e18; for (const t of turfs) { const d = dist2(t.deal.x, t.deal.z, p.x, p.z); if (d < bd) { bd = d; best = t; } }
        const top = GOOD_IDS.filter(k => !GOODS[k].fence && !GOODS[k].arms).map(k => ({ k, r: uw.market.ratio(z, k) })).sort((a, b) => b.r - a.r).slice(0, 2);
        add({ key: 'deal:' + z, name: `Street buyers · ${ZONES[z].name}`, cat: 'sell', x: best.deal.x, z: best.deal.z, sub: `SELL here · best now: ${top.map(o => GOODS[o.k].name).join(', ')}${['o', 'h', 'w', 's'].includes(z) ? ' · day and night' : ' · after dark'}` });
      }
      const pw = uw.loc('prop', 'pawn'); if (pw) add({ key: 'sell:pawn', name: 'Lucky’s Pawn · fence', cat: 'sell', x: pw.x + 1.5, z: pw.z + 1.5, sub: 'SELL hot goods and smokes · no questions asked' });
    }
    for (const ct of g.missions.contacts) if (ct.visible !== false && !ct.interior && (!ct.storyOnly || ct.marker.g.visible)) add({ key: 'ct:' + ct.id, name: ct.name, cat: 'contact', col: '#' + new THREE.Color(ct.color).getHexString(), x: ct.x, z: ct.z, sub: ct.role });
    this.entries = out;
    return out;
  }
  visibleEntries() { return this.entries.filter(e => this.layerOn(MAP_CATS[e.cat].layer)); }
  // ---------------------------------------------------------------- open / close / size
  toggle(force) {
    const g = this.g, on = force !== undefined ? force : $('bigmap').classList.contains('hidden');
    if (on && g.uw && g.uw.inJail && !g.uw.prison.phone()) { this.ui.toast('No map in here.', 'warn'); return; }
    this.ui.show('bigmap', on);
    g.mapOpen = on; HitchLog.mark(on ? 'opened the map' : 'closed the map');
    if (on) {
      this.buildIndex(); this.fit();
      const p = g.player, [px, pz] = this.ui._mapXY(p.pos.x, p.pos.z);
      if (!this._opened) { this._opened = true; this.zoom = this.tz = 1; this.cx = this.tcx = 512; this.cz = this.tcz = 512; }
      if (this.zoom > 1.05) { this.tcx = this.cx = px; this.tcz = this.cz = pz; }
      this.syncTools(); this.dirty = true; this.draw(); g.input.releaseAll();
    } else {
      $('turfInfo').classList.add('hidden'); this.closeDrawer(); this.hideCard(); $('mapLayers').classList.add('hidden'); this.ptrs.clear();
      if (document.activeElement === $('mapSearch')) $('mapSearch').blur();
      if (this.pickMode) this.endPick(false);
    }
  }
  fit() {
    if ($('bigmap').classList.contains('hidden')) return;
    const r = $('mapPanel').getBoundingClientRect();
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    const W = Math.max(50, Math.round(r.width)), H = Math.max(50, Math.round(r.height));
    if (this.cv.width !== Math.round(W * this.dpr) || this.cv.height !== Math.round(H * this.dpr)) { this.cv.width = Math.round(W * this.dpr); this.cv.height = Math.round(H * this.dpr); }
    this.W = W; this.H = H; this.dirty = true;
  }
  // map space <-> screen (CSS px inside the canvas)
  get scale() { return Math.min(this.W, this.H) / 1024 * this.zoom; }
  toScreen(mx, mz) { const s = this.scale; return [(mx - this.cx) * s + this.W / 2, (mz - this.cz) * s + this.H / 2]; }
  toMap(sx, sy) { const s = this.scale; return [(sx - this.W / 2) / s + this.cx, (sy - this.H / 2) / s + this.cz]; }
  worldToScreen(x, z) { const [mx, mz] = this.ui._mapXY(x, z); return this.toScreen(mx, mz); }
  screenToWorld(sx, sy) { const [mx, mz] = this.toMap(sx, sy); return [mx / this.ui.mapK - this.ui.mapE, mz / this.ui.mapK - this.ui.mapE]; }
  clampView(z, cx, cz) {
    const s = Math.min(this.W, this.H) / 1024 * z, hw = this.W / 2 / s, hh = this.H / 2 / s;
    // zoomed in, any point of the map can be brought to the centre (edges show water beyond)
    // east as far as Valen Point (map space is ui.mapW wide)
    const MW = this.ui.mapW || 1024;
    cx = hw >= 512 ? clamp(cx, 512, Math.max(512, MW - hw)) : clamp(cx, Math.min(hw, 0), Math.max(MW - hw, MW)); cz = hh >= 512 ? 512 : clamp(cz, Math.min(hh, 0), Math.max(1024 - hh, 1024));
    return [cx, cz];
  }
  // zoom keeping the map point under (sx,sy) fixed; animated unless instant
  zoomAt(f, sx, sy, instant) {
    const nz = clamp(this.tz * f, 1, 8);
    const [mx, mz] = this.toMap(sx, sy);
    // the point under the cursor stays put: solve for the new centre at the target zoom
    const s = Math.min(this.W, this.H) / 1024 * nz;
    let cx = mx - (sx - this.W / 2) / s, cz = mz - (sy - this.H / 2) / s;
    [cx, cz] = this.clampView(nz, cx, cz);
    this.tz = nz; this.tcx = cx; this.tcz = cz;
    if (instant) { this.zoom = nz; this.cx = cx; this.cz = cz; }
    this.dirty = true;
  }
  centerOn(x, z, zoom) { const [mx, mz] = this.ui._mapXY(x, z); const nz = zoom ? Math.max(this.tz, zoom) : this.tz; [this.tcx, this.tcz] = this.clampView(nz, mx, mz); this.tz = nz; this.dirty = true; }
  // ---------------------------------------------------------------- input
  _bind() {
    const cv = this.cv, bm = $('bigmap');
    bm.addEventListener('click', e => { if (e.target === bm) this.toggle(false); });
    const pos = e => { const r = cv.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
    cv.addEventListener('pointerdown', e => {
      e.preventDefault(); cv.setPointerCapture && cv.setPointerCapture(e.pointerId);
      const [x, y] = pos(e);
      this.ptrs.set(e.pointerId, { x, y, x0: x, y0: y, t0: performance.now() });
      if (this.ptrs.size === 1) { this.moved = false; this.panStart = { cx: this.tcx, cz: this.tcz }; }
      if (this.ptrs.size === 2) { this.moved = true; const [a, b] = [...this.ptrs.values()]; this.pinch = { d: Math.hypot(a.x - b.x, a.y - b.y) || 1, z: this.tz, mid: this.toMap((a.x + b.x) / 2, (a.y + b.y) / 2) }; }
    });
    cv.addEventListener('pointermove', e => {
      const pt = this.ptrs.get(e.pointerId); if (!pt) return;
      e.preventDefault();
      const [x, y] = pos(e); pt.x = x; pt.y = y;
      if (this.ptrs.size >= 2 && this.pinch) {
        const [a, b] = [...this.ptrs.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y) || 1, nz = clamp(this.pinch.z * d / this.pinch.d, 1, 8);
        const s = Math.min(this.W, this.H) / 1024 * nz, sx = (a.x + b.x) / 2, sy = (a.y + b.y) / 2;
        const [cx, cz] = this.clampView(nz, this.pinch.mid[0] - (sx - this.W / 2) / s, this.pinch.mid[1] - (sy - this.H / 2) / s);
        this.zoom = this.tz = nz; this.cx = this.tcx = cx; this.cz = this.tcz = cz; this.dirty = true;
      } else if (this.ptrs.size === 1) {
        if (Math.hypot(x - pt.x0, y - pt.y0) > 6) { this.moved = true; cv.classList.add('drag'); }
        if (this.moved) {
          const s = this.scale;
          const [cx, cz] = this.clampView(this.tz, this.panStart.cx - (x - pt.x0) / s, this.panStart.cz - (y - pt.y0) / s);
          this.cx = this.tcx = cx; this.cz = this.tcz = cz; this.zoom = this.tz; this.dirty = true;
        }
      }
    });
    const up = e => {
      const pt = this.ptrs.get(e.pointerId); if (!pt) return;
      this.ptrs.delete(e.pointerId); cv.classList.remove('drag');
      if (this.ptrs.size === 1) { const [q] = [...this.ptrs.values()]; q.x0 = q.x; q.y0 = q.y; this.panStart = { cx: this.tcx, cz: this.tcz }; this.pinch = null; }
      if (this.ptrs.size === 0) {
        this.pinch = null;
        if (!this.moved && e.type === 'pointerup') {
          const now = performance.now();
          if (this._lastTap && now - this._lastTap.t < 320 && Math.hypot(pt.x - this._lastTap.x, pt.y - this._lastTap.y) < 30) { this._lastTap = null; this.zoomAt(2, pt.x, pt.y); }
          else { this._lastTap = { t: now, x: pt.x, y: pt.y }; this.tap(pt.x, pt.y); }
        }
      }
    };
    cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
    cv.addEventListener('wheel', e => { e.preventDefault(); const [x, y] = pos(e); this.zoomAt(Math.exp(-e.deltaY * 0.0022), x, y); }, { passive: false });
    const btn = (id, f) => $(id).addEventListener('click', e => { e.stopPropagation(); this.g.audio.play('ui'); f(); });
    btn('mapZoomIn', () => this.zoomAt(1.6, this.W / 2, this.H / 2));
    btn('mapZoomOut', () => this.zoomAt(1 / 1.6, this.W / 2, this.H / 2));
    btn('mapMe', () => { const p = this.g.player; this.centerOn(p.pos.x, p.pos.z, 3); });
    btn('mapClose', () => this.toggle(false));
    btn('mapLayBtn', () => { const el = $('mapLayers'); const on = el.classList.contains('hidden'); el.classList.toggle('hidden', !on); if (on) { this.renderLayers(); this.closeDrawer(); } this.syncTools(); });
    btn('mapIdxBtn', () => { if ($('mapDrawer').classList.contains('hidden')) this.openDrawer(); else this.closeDrawer(); });
    btn('mapDrawerClose', () => this.closeDrawer());
    $('mapLayers').addEventListener('change', e => { const id = e.target.dataset.layer; if (id) this.setLayer(id, e.target.checked); });
    $('mapLayers').addEventListener('click', e => e.stopPropagation());
    $('mapSearch').addEventListener('input', () => this.renderList());
    $('mapCats').addEventListener('click', e => { e.stopPropagation(); const b = e.target.closest('[data-cat]'); if (!b) return; this.cat = b.dataset.cat; this.renderList(); });
    $('mapList').addEventListener('click', e => { e.stopPropagation(); const b = e.target.closest('[data-key]'); if (!b) return; const en = this.entries.find(x => x.key === b.dataset.key); if (!en) return; if (this.W < 700) this.closeDrawer(); this.select(en, true); });
    $('mapCard').addEventListener('click', e => {
      e.stopPropagation(); const b = e.target.closest('[data-act]'); if (!b || !this.sel) return;
      const en = this.sel, act = b.dataset.act, ct = this.g.content;
      this.g.audio.play('ui');
      if (act === 'track') { ct.setWaypoint(en.x, en.z, en.name); Object.assign(ct.waypoint, { key: en.key, icon: en.icon, col: en.col }); this.g.ui.toast(`Tracking ${en.name}.`); }
      else if (act === 'untrack') { ct.waypoint = null; this.g.ui.toast('Tracking stopped.'); }
      else if (act === 'taxi') { const g = this.g, kp = nearestRoadPoint(en.x, en.z); this.toggle(false); if (kp) g.taxi.call({ x: kp.x, z: kp.z }); return; }
      else if (act === 'close') { this.hideCard(); return; }
      this.showCard(en); this.dirty = true;
    });
    $('mapDrawer').addEventListener('click', e => e.stopPropagation());
    $('mapPick').addEventListener('click', e => {
      e.stopPropagation(); const b = e.target.closest('[data-pk]'); if (!b || !this.pickMode) return; this.g.audio.play('ui');
      const o = this.pickMode;
      if (b.dataset.pk === 'cancel') { this.endPick(false); this.toggle(false); return; }
      if (o.dest && o.q && o.confirm(o.dest.x, o.dest.z, o.q)) { this.pickMode = null; $('mapPick').classList.add('hidden'); this.toggle(false); }
    });
    btn('mapTaxiBtn', () => { if (this.pickMode) return; this.toggle(false); this.g.taxi.call(); });
  }
  syncTools() { $('mapLayBtn').classList.toggle('on', !$('mapLayers').classList.contains('hidden')); $('mapIdxBtn').classList.toggle('on', !$('mapDrawer').classList.contains('hidden')); }
  renderLayers() {
    $('mapLayers').innerHTML = MAP_LAYERS.map(([id, name]) => `<label><input type="checkbox" data-layer="${id}" ${this.layerOn(id) ? 'checked' : ''}>${name}</label>`).join('') +
      '<div class="mdGroup">Symbols</div>' + Object.keys(MAP_CATS).map(k => `<label style="min-height:30px;font-weight:600;font-size:13px"><span class="ico" style="background:${MAP_CATS[k].col}">${MAP_CATS[k].icon}</span>${MAP_CATS[k].name}</label>`).join('');
  }
  openDrawer() {
    this.buildIndex(); $('mapDrawer').classList.remove('hidden'); $('mapLayers').classList.add('hidden');
    this.renderCats(); this.renderList(); this.syncTools();
  }
  closeDrawer() { $('mapDrawer').classList.add('hidden'); this.syncTools(); }
  renderCats() {
    const cats = ['all', ...Object.keys(MAP_CATS).filter(k => this.entries.some(e => e.cat === k))];
    $('mapCats').innerHTML = cats.map(k => `<button data-cat="${k}" class="${this.cat === k ? 'on' : ''}">${k === 'all' ? 'All' : MAP_CATS[k].name}</button>`).join('');
  }
  renderList() {
    if (!this.entries.length) this.buildIndex();
    if (this.cat !== 'all' && !this.entries.some(e => e.cat === this.cat)) this.cat = 'all';
    this.renderCats();
    const q = ($('mapSearch').value || '').trim().toLowerCase(), p = this.g.player, wp = this.g.content.waypoint;
    const list = this.entries.filter(e => (this.cat === 'all' || e.cat === this.cat) && (!q || (e.name + ' ' + MAP_CATS[e.cat].name + ' ' + e.district + ' ' + (e.sub || '')).toLowerCase().includes(q)));
    const order = Object.keys(MAP_CATS);
    list.sort((a, b) => order.indexOf(a.cat) - order.indexOf(b.cat) || Math.hypot(a.x - p.pos.x, a.z - p.pos.z) - Math.hypot(b.x - p.pos.x, b.z - p.pos.z));
    let h = '', last = null;
    for (const e of list) {
      if (e.cat !== last) { last = e.cat; h += `<div class="mdGroup">${MAP_CATS[e.cat].name}</div>`; }
      const d = Math.hypot(e.x - p.pos.x, e.z - p.pos.z), tracked = wp && wp.key === e.key;
      h += `<button class="mdItem${this.sel && this.sel.key === e.key ? ' sel' : ''}" data-key="${esc(e.key)}"><span class="ico" style="background:${e.col}">${e.icon}</span><span><b>${esc(e.name)}</b><small>${esc(e.district)} · ${fmtDist(d)}${e.sub ? ' · ' + esc(e.sub) : ''}</small></span>${tracked ? '<span class="tr2">TRACKED</span>' : ''}</button>`;
    }
    $('mapList').innerHTML = h || '<div class="hint" style="padding:12px">Nothing matches that search.</div>';
  }
  // ---------------------------------------------------------------- destination picking (taxi)
  // A tap anywhere picks the nearest street point; the panel shows where, how far and the fare.
  startPick(o) {
    this.pickMode = o; o.dest = null; o.q = null;
    if (!this.g.mapOpen) this.toggle(true);
    this.hideCard(); this.closeDrawer();
    $('mapPick').classList.remove('hidden');
    if (o.preset) { this.setPick(o.preset.x, o.preset.z); this.centerOn(o.preset.x, o.preset.z, 2.2); }
    else { const p = this.g.player; this.centerOn(p.pos.x, p.pos.z, 2.2); }
    this.renderPick();
  }
  setPick(wx, wz) {
    const o = this.pickMode; if (!o) return;
    const kp = nearestRoadPoint(wx, wz);
    if (!kp || kp.d > 140 || ((wx < -40 || wz < -40 || wx > CITY + 40 || wz > CITY + 40) && !inValenPoint(wx, wz))) { this.g.ui.toast('No road there. Tap a street.', 'warn'); return; }
    o.dest = { x: kp.x, z: kp.z }; o.q = o.quote(kp.x, kp.z);
    this.renderPick(); this.dirty = true;
  }
  renderPick() {
    const o = this.pickMode; if (!o) return;
    const q = o.q, money = Money.available('taxi');
    $('mapPick').innerHTML = `<b>${esc(o.title)}</b>${q ? `<div class="stats"><span>Destination</span><span><b>${esc(q.name)}</b></span><span>Distance</span><span>${fmtDist(q.m)}</span><span>Fare</span><span><b style="color:${q.fare > money ? 'var(--red)' : 'var(--money)'}">${fmtMoney(q.fare)}</b></span></div>` : '<div class="hint" style="margin-top:4px">Tap any street on the map. The orange arrow is you.</div>'}
      <div class="btns"><button class="sbtn" data-pk="cancel">Cancel</button><button class="sbtn gold" data-pk="ok" ${q && q.fare <= money ? '' : 'disabled'}>${q ? 'Ride · ' + fmtMoney(q.fare) : 'Pick a place'}</button></div>`;
  }
  endPick(ok) { const o = this.pickMode; if (!o) return; this.pickMode = null; $('mapPick').classList.add('hidden'); if (!ok && o.cancel) o.cancel(); this.dirty = true; }
  // ---------------------------------------------------------------- selection
  tap(sx, sy) {
    if (this.pickMode) { const [wx, wz] = this.screenToWorld(sx, sy); this.setPick(wx, wz); return; }
    const hit = this.hitTest(sx, sy);
    if (hit) { this.select(hit, false); return; }
    const hadCard = !$('mapCard').classList.contains('hidden');
    this.hideCard();
    const [wx, wz] = this.screenToWorld(sx, sy);
    const g = this.g;
    if (g.uw && g.uw.ui.mapClick(wx, wz)) return;
    $('turfInfo').classList.add('hidden');
    // a tap on open map: the curved road under the finger, else the district (a tap with a card open just closes it)
    if (hadCard) return;
    if (!isFinite(wx) || !isFinite(wz)) return;
    // the finger's width (about 9 css px) in metres at the current zoom
    const en = this.roadEntry(wx, wz, 9 / Math.max(1e-6, this.scale * this.ui.mapK)) || this.districtEntry(wx, wz);
    if (en) { this.sel = en; this.showCard(en); this.dirty = true; }
  }
  roadEntry(x, z, r) {
    const ln = Links.nearest(x, z); if (!ln || ln.d > Math.max(6, r)) return null;
    const L = ln.link, zone = ZONES[zoneKey(ln.x, ln.z)];
    return { key: 'road:' + L.id, name: L.name, cat: 'landmark', catName: 'Road', icon: '≈', col: '#c8ccd2', x: ln.x, z: ln.z, district: zone.name,
      extra: `<div class="stats"><span>Length</span><span>${fmtDist(L.len)}</span><span>Surface</span><span>${L.road.st === 'dirt' ? 'Dirt track' : 'Asphalt'}</span><span>Joins</span><span>${L.ends.map(e => e.axis === 0 ? STREET_NAMES_X[e.line] : STREET_NAMES_Z[e.line]).join(' · ')}</span></div><div class="hint" style="margin:6px 0 0">A winding through-road. Traffic and your GPS use it.</div>` };
  }
  districtEntry(x, z) {
    const g = this.g, uw = g.uw; if (x < 0 || z < 0 || x >= CITY || z >= CITY) return null;
    const zk = zoneKey(x, z), Z = ZONES[zk], cen = ZONE_CENTRE[zk];
    const lvl = v => v >= 1.4 ? 'Heavy' : v >= 1.0 ? 'Normal' : v >= 0.6 ? 'Light' : 'Rare';
    let h = `<div class="hint" style="margin:6px 0 0">${esc(Z.tag)}</div><div class="stats"><span>Police presence</span><span>${lvl(Z.cops)}</span><span>Foot traffic</span><span>${lvl(Z.ped)}</span><span>Nightlife</span><span>${lvl(Z.night)}</span>`;
    if (uw) {
      const turfs = uw.T.map((t, i) => ({ t, i })).filter(o => o.t.zone === zk);
      const mine = turfs.filter(o => uw.owner[o.i] === 'pc'), fac = {};
      for (const o of turfs) { const own = uw.owner[o.i]; if (own && own !== 'pc' && FACTIONS[own]) fac[FACTIONS[own].short] = (fac[FACTIONS[own].short] || 0) + 1; }
      const tax = mine.reduce((a, o) => a + uw.royalty.owed(o.i), 0);
      const props = uw.locs.filter(L => L.kind === 'prop' && zoneKey(L.x, L.z) === zk);
      h += `<span>Turf</span><span>${turfs.length ? `${mine.length} of ${turfs.length} yours${Object.keys(fac).length ? ' · ' + Object.entries(fac).map(([f, n]) => `${esc(f)} ${n}`).join(', ') : ''}` : 'none'}</span>`;
      if (mine.length) h += `<span>Territory tax</span><span>${fmtMoney(tax)}/day</span>`;
      h += `<span>Property</span><span>${props.filter(L => uw.props.owned(L.def.id)).length} owned · ${props.filter(L => !uw.props.owned(L.def.id)).length} for sale</span></div>`;
      if (DEMAND[zk]) {
        h += '<div class="mdGroup" style="margin-top:8px">Street prices now</div><div class="stats">';
        for (const k of GOOD_IDS) { if (GOODS[k].fence || GOODS[k].arms) continue; const r = uw.market.ratio(zk, k); h += `<span>${esc(GOODS[k].name)}</span><span style="color:${r > 1.12 ? 'var(--green)' : r < 0.88 ? 'var(--red)' : 'inherit'}">${fmtPerUnit(k, uw.market.price(zk, k))} ${r > 1.12 ? '▲' : r < 0.88 ? '▼' : ''}</span>`; }
        h += '</div>';
      }
    } else h += '</div>';
    return { key: 'dist:' + zk, name: Z.name, cat: 'landmark', catName: 'District', icon: '◎', col: Z.col, x: cen.x, z: cen.z, district: Z.name, extra: h };
  }
  // economy layer: in every district, the street good paying furthest over its base price
  drawEconomy(c) {
    const uw = this.g.uw, ui = this.g.ui, k = 1 / Math.max(0.6, this.zoom);
    c.textAlign = 'center';
    for (const zk in ZONE_CENTRE) {
      const b = econBest(uw, zk); if (!b) continue;
      const cen = ZONE_CENTRE[zk], [mx, mz] = ui._mapXY(cen.x, cen.z + 40);
      const txt = `${GOODS[b.k].name} ${fmtPerUnit(b.k, b.price)}`, up = b.r > 1.12, dn = b.r < 0.88;
      c.font = `bold ${Math.round(13 * k * 1.4)}px Arial`; const w = c.measureText(txt).width + 14 * k;
      c.fillStyle = 'rgba(10,12,18,0.82)'; c.fillRect(mx - w / 2, mz - 12 * k, w, 22 * k);
      c.fillStyle = up ? '#7fe08f' : dn ? '#ff7a85' : '#ffd84d'; c.fillText(txt + (up ? ' ▲' : dn ? ' ▼' : ''), mx, mz + 4 * k);
    }
  }
  hitTest(sx, sy) {
    let best = null, bd = 24;
    for (const e of this._drawn || []) { const d = Math.hypot(e.sx - sx, e.sy - sy); if (d < bd) { bd = d; best = e.en; } }
    return best;
  }
  select(en, fromList) {
    this.sel = en; this.hl = 2.5;
    $('turfInfo').classList.add('hidden');
    this.centerOn(en.x, en.z, fromList ? 3.2 : 0);
    if (fromList && this.W < 640) this.closeDrawer();
    this.showCard(en); this.dirty = true;
    if (!$('mapDrawer').classList.contains('hidden')) this.renderList();
  }
  hideCard() { $('mapCard').classList.add('hidden'); this.sel = null; this.dirty = true; }
  showCard(en) {
    const g = this.g, p = g.player, ct = g.content, uw = g.uw, wp = ct.waypoint, tracked = wp && wp.key === en.key;
    const d = Math.hypot(en.x - p.pos.x, en.z - p.pos.z);
    let stats = '';
    if (en.prop) {
      const def = en.prop, own = uw.props.owned(def.id), cap = uw.props.capOf ? uw.props.capOf(def) : def.garage || 0;
      const kind = def.tier ? `Tier ${def.tier} · ${def.type || def.kind}` : def.kind;
      const feats = [];
      if (def.kind === 'safehouse') feats.push('sleep & save', 'heat cools overnight');
      if (def.storage) feats.push(`stash ${def.storage}`);
      if (def.crew) feats.push(`room for ${def.crew} crew`);
      if (def.income) feats.push(`~${fmtMoney(def.income)}/day`);
      stats = `<div class="stats"><span>Status</span><span>${own ? 'Owned' : 'For sale'}</span><span>Price</span><span>${fmtMoney(uw.props.price(def))}</span><span>Type</span><span>${esc(kind)}</span><span>Parking</span><span>${esc(uw.props.parkingText ? uw.props.parkingText(def) : (cap ? cap + ' spaces' : 'none'))}</span><span>District</span><span>${esc(en.district)}</span>${feats.length ? `<span>Features</span><span>${esc(feats.join(' · '))}</span>` : ''}</div>`;
      if (def.desc) stats += `<div class="hint" style="margin:8px 0 0">${esc(def.desc)}</div>`;
    }
    const cab = !g.player.interior && g.player.state === 'foot';
    $('mapCard').innerHTML = `<button class="mtb x" data-act="close" aria-label="Close">&#10005;</button><div class="mapCardHead"><span class="ico" style="background:${en.col}">${en.icon}</span><div><b>${esc(en.name)}</b><small>${esc(en.catName || MAP_CATS[en.cat].name)} · ${esc(en.district)} · ${fmtDist(d)} away</small></div></div>${en.sub && !en.prop ? `<div class="hint" style="margin:6px 0 0">${esc(en.sub)}</div>` : ''}${stats}${en.extra || ''}
      <div class="btns">${tracked ? '<button class="sbtn" data-act="untrack">Stop tracking</button>' : '<button class="sbtn gold" data-act="track">Track location</button>'}${cab ? '<button class="sbtn" data-act="taxi">&#128661; Taxi here</button>' : ''}</div>`;
    $('mapCard').classList.remove('hidden');
  }
  // ---------------------------------------------------------------- per frame
  tick(dt) {
    if (!this.g.mapOpen) return;
    const k = 1 - Math.exp(-dt * 14);
    const anim = Math.abs(this.zoom - this.tz) > 1e-3 || Math.abs(this.cx - this.tcx) > 0.05 || Math.abs(this.cz - this.tcz) > 0.05;
    if (anim) { this.zoom += (this.tz - this.zoom) * k; this.cx += (this.tcx - this.cx) * k; this.cz += (this.tcz - this.cz) * k; this.dirty = true; }
    if (this.hl > 0) { this.hl -= dt; this.dirty = true; }
    const r = $('mapPanel').getBoundingClientRect();
    if (Math.round(r.width) !== this.W || Math.round(r.height) !== this.H) this.fit();
    this.refreshT -= dt; if (this.refreshT <= 0) { this.refreshT = 0.5; this.dirty = true; }
    if (this.dirty) this.draw();
  }
  // ---------------------------------------------------------------- drawing
  draw() {
    if (!this.g.mapOpen) return;
    this.dirty = false;
    const g = this.g, ui = this.ui, c = this.c, d = this.dpr, W = this.W, H = this.H, s = this.scale, k = ui.mapK;
    c.setTransform(d, 0, 0, d, 0, 0);
    c.fillStyle = '#0f2b3a'; c.fillRect(0, 0, W, H);
    // map-space layers under the view transform
    c.save();
    c.setTransform(d * s, 0, 0, d * s, d * (W / 2 - this.cx * s), d * (H / 2 - this.cz * s));
    if (this.zoom < 1.35) { c.drawImage(ui.mapImg, 0, 0, 1024, 1024); if (ui.vpImg) c.drawImage(ui.vpImg.img, ui.vpImg.x, ui.vpImg.z); }
    else { const [x0, z0] = this.screenToWorld(0, 0), [x1, z1] = this.screenToWorld(W, H); ui._paintMap(c, { x0, z0, x1, z1 }); }
    if (g.uw && g.uw.mapOverlay) { g.uw.ui.drawOverlay(c, false); c.globalAlpha = 1; }
    if (g.uw && this.layerOn('economy')) this.drawEconomy(c);
    // route to the tracked place
    const wp = g.content.waypoint, m = g.missions.active, tgt = (m && m.target) || wp;
    const pk = this.pickMode && this.pickMode.dest ? this.pickMode : null;
    if (pk) {
      const f = pk.q.from, route = gpsRoute(f.x, f.z, pk.dest.x, pk.dest.z);
      c.strokeStyle = 'rgba(244,194,13,0.95)'; c.lineWidth = Math.max(3, 6 / this.zoom) * 1.3; c.lineJoin = 'round'; c.lineCap = 'round';
      c.beginPath(); c.moveTo(...ui._mapXY(f.x, f.z)); route.forEach(q => c.lineTo(...ui._mapXY(q.x, q.z))); c.lineTo(...ui._mapXY(pk.dest.x, pk.dest.z)); c.stroke();
    }
    if (tgt && !pk) {
      const route = gpsRoute(g.player.pos.x, g.player.pos.z, tgt.x, tgt.z);
      c.strokeStyle = m ? 'rgba(255,216,77,0.9)' : 'rgba(127,224,143,0.9)'; c.lineWidth = Math.max(3, 6 / this.zoom) * 1.2; c.lineJoin = 'round'; c.lineCap = 'round';
      c.beginPath(); route.forEach((q, i) => { const [x, z] = ui._mapXY(q.x, q.z); i ? c.lineTo(x, z) : c.moveTo(x, z); }); c.stroke();
    }
    c.restore();
    c.setTransform(d, 0, 0, d, 0, 0);
    // screen-space labels: districts first, then landmarks/streets as you zoom in
    const boxes = [], fits = (x, y, w, h) => { const b = { l: x - 2, t: y - 2, r: x + w + 2, b: y + h + 2 }; if (b.l < 0 || b.t < 0 || b.r > W || b.b > H) return false; for (const q of boxes) if (b.l < q.r && b.r > q.l && b.t < q.b && b.b > q.t) return false; boxes.push(b); return true; };
    const text = (t, x, y, size, col, weight = 800, shadow = true) => {
      c.font = `${weight} ${size}px Arial, sans-serif`; const w = c.measureText(t).width;
      if (!fits(x - w / 2, y - size * 0.8, w, size)) return false;
      c.textAlign = 'center'; c.textBaseline = 'alphabetic';
      if (shadow) { c.fillStyle = 'rgba(0,0,0,0.75)'; c.fillText(t, x + 1, y + 1); }
      c.fillStyle = col; c.fillText(t, x, y); return true;
    };
    // markers (icons keep a constant on-screen size)
    const ents = this.visibleEntries(), drawn = [];
    const R = this.zoom < 1.6 ? 8 : this.zoom < 3 ? 10 : 12;
    for (const e of ents) {
      const [sx, sy] = this.worldToScreen(e.x, e.z);
      if (sx < -20 || sy < -20 || sx > W + 20 || sy > H + 20) continue;
      const sel = this.sel && this.sel.key === e.key;
      const tracked = wp && wp.key === e.key;
      drawMapBadge(c, sx, sy, sel ? R + 3 : R, e.col, e.icon, tracked ? '#7fe08f' : null);
      boxes.push({ l: sx - R, t: sy - R, r: sx + R, b: sy + R });
      drawn.push({ sx, sy, en: e });
    }
    this._drawn = drawn;
    // district names
    for (const L of ui.mmImg.labels) if (L.big) { const [sx, sy] = this.toScreen(L.x, L.z); text(L.t, sx, sy, this.zoom < 2 ? 12 : 14, L.col, 900); }
    // marker names: important ones early, everything once zoomed in
    const z = this.zoom;
    for (const dd of drawn) {
      const e = dd.en, imp = e.cat === 'landmark' || e.cat === 'chop' || e.cat === 'owned' || e.cat === 'police' || e.cat === 'hospital' || (this.sel && this.sel.key === e.key);
      if (z < 1.6 && !imp) continue;
      if (z < 2.6 && !imp && e.cat !== 'service' && e.cat !== 'garage') continue;
      text(e.name, dd.sx, dd.sy + R + 14, 12, '#ffffff', 700);
    }
    // street names when close
    if (z >= 3.2) {
      c.font = '700 11px Arial, sans-serif';
      for (let i = 0; i <= N; i++) for (let j = 0; j < N; j++) {
        if (typeof RoadNet !== 'undefined' && !RoadNet.segOpen(0, i, j)) continue;
        const [sx, sy] = this.worldToScreen(i * P, j * P + P / 2); if (sx < 0 || sx > W || sy < 0 || sy > H) continue;
        const t = STREET_NAMES_X[i], w2 = c.measureText(t).width;
        if (!fits(sx - 7, sy - w2 / 2, 14, w2)) continue;
        c.save(); c.translate(sx, sy); c.rotate(-Math.PI / 2); c.textAlign = 'center'; c.fillStyle = 'rgba(0,0,0,0.7)'; c.fillText(t, 1, 4); c.fillStyle = '#d8dde6'; c.fillText(t, 0, 3); c.restore();
      }
      for (let j = 0; j <= N; j++) for (let i = 0; i < N; i++) {
        if (typeof RoadNet !== 'undefined' && !RoadNet.segOpen(1, j, i)) continue;
        const [sx, sy] = this.worldToScreen(i * P + P / 2, j * P); if (sx < 0 || sx > W || sy < 0 || sy > H) continue;
        text(STREET_NAMES_Z[j], sx, sy + 4, 11, '#d8dde6', 700);
      }
    }
    // live units, objective and the player
    const dot = (x, z, col, r) => { const [sx, sy] = this.worldToScreen(x, z); c.fillStyle = col; c.strokeStyle = '#000'; c.lineWidth = 2; c.beginPath(); c.arc(sx, sy, r, 0, 7); c.fill(); c.stroke(); };
    if (this.layerOn('police')) for (const u of g.police.units) dot(u.v.pos.x, u.v.pos.z, '#ff4d5e', 5);
    for (const pk of g.world.packages) if (g.save.hints[pk.id] && !g.save.packages[pk.id]) { const [sx, sy] = this.worldToScreen(pk.x, pk.z); c.strokeStyle = '#7fe08f'; c.lineWidth = 3; c.beginPath(); c.moveTo(sx - 6, sy - 6); c.lineTo(sx + 6, sy + 6); c.moveTo(sx + 6, sy - 6); c.lineTo(sx - 6, sy + 6); c.stroke(); }
    if (m && m.target) dot(m.target.x, m.target.z, '#ffd84d', 9);
    if (wp && !wp.key) dot(wp.x, wp.z, '#7fe08f', 8);
    if (this.pickMode && this.pickMode.dest) { const [sx, sy] = this.worldToScreen(this.pickMode.dest.x, this.pickMode.dest.z); c.fillStyle = '#f4c20d'; c.strokeStyle = '#1a1206'; c.lineWidth = 2.5; c.beginPath(); c.moveTo(sx, sy); c.arc(sx, sy - 18, 9, Math.PI * 0.8, Math.PI * 2.2); c.closePath(); c.fill(); c.stroke(); c.fillStyle = '#1a1206'; c.beginPath(); c.arc(sx, sy - 18, 3.5, 0, 7); c.fill(); }
    if (g.taxi && g.taxi.cab && g.taxi.state !== 'idle') dot(g.taxi.cab.pos.x, g.taxi.cab.pos.z, '#f4c20d', 6);
    if (this.sel && this.hl > 0) { const [sx, sy] = this.worldToScreen(this.sel.x, this.sel.z); const ph = (2.5 - this.hl) % 0.8 / 0.8; c.strokeStyle = `rgba(255,216,77,${1 - ph})`; c.lineWidth = 3; c.beginPath(); c.arc(sx, sy, R + 6 + ph * 22, 0, 7); c.stroke(); }
    const p = g.player, [px, py] = this.worldToScreen(p.pos.x, p.pos.z);
    c.save(); c.translate(px, py); c.rotate(-(p.state === 'vehicle' && p.vehicle ? p.vehicle.h : p.h) + Math.PI);
    c.fillStyle = '#ffb547'; c.strokeStyle = '#000'; c.lineWidth = 2; c.beginPath(); c.moveTo(0, -12); c.lineTo(9, 10); c.lineTo(0, 5); c.lineTo(-9, 10); c.closePath(); c.fill(); c.stroke(); c.restore();
    // scale bar
    const mPerPx = 1 / (s * k), bar = [50, 100, 200, 500].find(v => v / mPerPx > 60) || 500, bw = bar / mPerPx;
    c.fillStyle = 'rgba(14,17,24,0.8)'; c.fillRect(8, H - 26, bw + 16, 18); c.fillStyle = '#fff'; c.fillRect(16, H - 14, bw, 3); c.font = '700 10px Arial'; c.textAlign = 'left'; c.fillText(bar + ' m', 16, H - 17);
    if (g.uw) $('mapStat').textContent = `${RANKS[g.uw.rank].name} · ${g.uw.playerTurfs()} turfs · influence ${g.uw.influence} · rep ${g.save.rep} · pressure ${Math.round(g.uw.S.pressure)} · day ${g.uw.calDay}`;
  }
}
function fmtDist(d) { return d >= 1000 ? (d / 1000).toFixed(1) + ' km' : Math.round(d / 10) * 10 + ' m'; }
// GPS over the lattice plus the curved links. Nodes: the 13x13 lattice nodes, then each link end
// (a T-junction part way along a lattice segment), then the start and goal. A link edge carries
// its polyline, so the route drawn on the maps bends with the road.
const GPS = {
  _g: null,
  graph() {
    if (this._g && this._g.n === Links.list.length) return this._g;
    const W2 = N + 1, nodes = [], adj = [], id = (i, j) => i * W2 + j;
    for (let i = 0; i <= N; i++) for (let j = 0; j <= N; j++) { nodes[id(i, j)] = { x: i * P, z: j * P }; adj[id(i, j)] = []; }
    const edge = (a, b, w, poly) => { adj[a].push({ to: b, w, poly }); adj[b].push({ to: a, w, poly: poly ? poly.slice().reverse() : null }); };
    const ends = new Map(); // segment key -> [{ along, node }]
    for (const L of Links.list) {
      L.gps = L.ends.map((e, k) => { const n = nodes.length; nodes.push({ x: e.C.x, z: e.C.z }); adj.push([]); if (e.free) return n; const key = Links.key(e.axis, e.line, e.seg); if (!ends.has(key)) ends.set(key, []); ends.get(key).push({ along: e.along, node: n }); return n; });
      const poly = L.pts.map(q => ({ x: q[0], z: q[1] }));
      // a spur gets a node at every vertex (so a point off the city can join it part way along)
      if (L.spur) { L.vids = this._poly(nodes, adj, edge, L.pts, L.gps[0], L.gps[1]); continue; }
      edge(L.gps[0], L.gps[1], L.len + 2 * ROAD_HALF, poly);
    }
    // Valen Point's own routes and the circuit (Session 6B): polylines whose first point meets the spur's far end
    const vp = typeof game !== 'undefined' && game.world && game.world.vp;
    const extra = [];
    if (vp) {
      const spur = Links.list.find(L => L.spur), at = new Map(), key = q => Math.round(q[0] * 10) + ':' + Math.round(q[1] * 10);
      if (spur) at.set(key(vp.road0), spur.gps[1]);
      const fixed = q => at.get(key(q));
      for (const r of vp.roads) { const ids = this._poly(nodes, adj, edge, r, fixed(r[0]), fixed(r[r.length - 1])); at.set(key(r[0]), ids[0]); at.set(key(r[r.length - 1]), ids[ids.length - 1]); for (let k = 1; k < r.length - 1; k++) if (!at.has(key(r[k]))) at.set(key(r[k]), ids[k]); extra.push({ pts: r, ids }); }
      // the circuit, a closed loop every 25 samples, joined at the pit exit and entry samples
      const T = vp.track, ks = []; for (let k = 0; k < T.pts.length; k += 25) ks.push(k);
      for (const k of [vp.exitK, vp.entryK]) if (!ks.includes(k)) ks.push(k);
      ks.sort((p2, q) => p2 - q);
      const loop = ks.map(k => T.pts[k]), ids = loop.map(q => at.get(key(q)) ?? (nodes.push({ x: q[0], z: q[1] }), adj.push([]), nodes.length - 1));
      for (let k = 0; k < loop.length; k++) { const a = ids[k], b2 = ids[(k + 1) % loop.length], A = loop[k], B = loop[(k + 1) % loop.length]; edge(a, b2, Math.hypot(B[0] - A[0], B[1] - A[1]), null); }
      extra.push({ pts: [...loop, loop[0]], ids: [...ids, ids[0]] });
    }
    this.extra = extra;
    for (const [a, len] of [[0, N], [1, N]]) for (let line = 0; line <= N; line++) for (let seg = 0; seg < len; seg++) {
      if (!RoadNet.segOpen(a, line, seg)) continue;
      const n0 = a === 0 ? id(line, seg) : id(seg, line), n1 = a === 0 ? id(line, seg + 1) : id(seg + 1, line);
      const mids = (ends.get(Links.key(a, line, seg)) || []).slice().sort((p, q) => p.along - q.along);
      let prev = n0, at = 0;
      for (const m of mids) { edge(prev, m.node, m.along - at, null); prev = m.node; at = m.along; }
      edge(prev, n1, P - at, null);
    }
    this._g = { nodes, adj, n: Links.list.length };
    return this._g;
  },
  // a polyline of nodes (first and last can be existing nodes); returns the node id of every vertex
  _poly(nodes, adj, edge, pts, first, last) {
    const ids = pts.map((q, k) => k === 0 && first !== undefined ? first : k === pts.length - 1 && last !== undefined ? last : (nodes.push({ x: q[0], z: q[1] }), adj.push([]), nodes.length - 1));
    for (let k = 1; k < pts.length; k++) edge(ids[k - 1], ids[k], Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]), null);
    return ids;
  },
  // a route between any two points, either of them off the lattice: each end joins the graph at the nearest point
  // of a spur (when it is off the city) or at its nearest lattice node, by a straight line
  routeAny(fx, fz, tx, tz) {
    const G = this.graph(), nodes = G.nodes.slice(), adj = G.adj.map(a => a.slice()), W2 = N + 1;
    const join = (x, z, isGoal) => {
      const me = nodes.length; nodes.push({ x, z }); adj.push([]);
      const link = (a, b, w, poly) => { adj[a].push({ to: b, w, poly }); };
      if (vpSide(x, z)) {
        // the nearest point on the spur or any of Valen Point's routes; X joins the two vertices either side of it
        const polys = [...Links.list.filter(L => L.spur && L.vids).map(L => ({ pts: L.pts, ids: L.vids })), ...(this.extra || [])];
        let best = null;
        for (const pl of polys) for (let k = 0; k < pl.pts.length - 1; k++) {
          const a = pl.pts[k], b = pl.pts[k + 1], dx = b[0] - a[0], dz = b[1] - a[1], l2 = dx * dx + dz * dz || 1;
          const t = clamp(((x - a[0]) * dx + (z - a[1]) * dz) / l2, 0, 1), px = a[0] + dx * t, pz = a[1] + dz * t, d = Math.hypot(x - px, z - pz);
          if (!best || d < best.d) best = { pl, k, x: px, z: pz, d, t, l: Math.sqrt(l2) };
        }
        if (!best) return -1;
        const X = nodes.length; nodes.push({ x: best.x, z: best.z }); adj.push([]);
        const A = best.pl.ids[best.k], B = best.pl.ids[best.k + 1];
        for (const [n, w] of [[A, best.t * best.l], [B, (1 - best.t) * best.l]]) { link(n, X, w, null); link(X, n, w, null); }
        if (isGoal) link(X, me, best.d, null); else link(me, X, best.d, null);
        return me;
      }
      const [i, j] = RoadNet.nearNode(x, z), n = i * W2 + j, d = Math.hypot(x - i * P, z - j * P);
      if (isGoal) link(n, me, d, null); else link(me, n, d, null);
      return me;
    };
    const src = join(fx, fz, false), dst = join(tx, tz, true); if (src < 0 || dst < 0) return null;
    const dist = new Float64Array(nodes.length).fill(Infinity), prev = new Int32Array(nodes.length).fill(-1), via = new Array(nodes.length), done = new Uint8Array(nodes.length);
    dist[src] = 0;
    for (;;) {
      let u = -1, best = Infinity; for (let k = 0; k < nodes.length; k++) if (!done[k] && dist[k] < best) { best = dist[k]; u = k; }
      if (u < 0 || u === dst) break;
      done[u] = 1;
      for (const e of adj[u]) { const nd = dist[u] + e.w; if (nd < dist[e.to]) { dist[e.to] = nd; prev[e.to] = u; via[e.to] = e; } }
    }
    if (!isFinite(dist[dst])) return null;
    const chain = []; for (let c = dst; c !== src; c = prev[c]) chain.push(c);
    chain.reverse();
    const out = [{ x: fx, z: fz }];
    for (const c of chain) { const e = via[c]; if (e.poly) out.push(...e.poly); out.push(nodes[c]); }
    return out;
  },
  _nearOn(L, x, z) {
    let best = null;
    for (let k = 0; k < L.pts.length - 1; k++) {
      const a = L.pts[k], b = L.pts[k + 1], dx = b[0] - a[0], dz = b[1] - a[1], l2 = dx * dx + dz * dz || 1;
      const t = clamp(((x - a[0]) * dx + (z - a[1]) * dz) / l2, 0, 1), px = a[0] + dx * t, pz = a[1] + dz * t, d = Math.hypot(x - px, z - pz);
      if (!best || d < best.d) best = { link: L, k, x: px, z: pz, d, along: L.cum[k] + Math.sqrt(l2) * t };
    }
    return best;
  },
  route(fx, fz, i, j, tx, tz, gi, gj) {
    const G = this.graph(), W2 = N + 1, nodes = G.nodes.slice(), adj = G.adj.slice();
    const src = i * W2 + j;
    // the goal: the nearest lattice node, or a point on a link when the target sits on (or by) one
    let dst = gi * W2 + gj;
    const ln = Links.nearest(tx, tz);
    if (ln && ln.d < Math.hypot(tx - gi * P, tz - gj * P) && ln.d < 40) {
      dst = nodes.length; nodes.push({ x: ln.x, z: ln.z }); adj.push([]);
      const L = ln.link, toA = L.pts.slice(0, ln.k + 1).map(q => ({ x: q[0], z: q[1] })), toB = L.pts.slice(ln.k + 1).map(q => ({ x: q[0], z: q[1] }));
      // walk from each end of the link to the goal point (polylines oriented end -> goal)
      adj[L.gps[0]] = adj[L.gps[0]].concat([{ to: dst, w: ln.along + ROAD_HALF, poly: [...toA, { x: ln.x, z: ln.z }] }]);
      adj[L.gps[1]] = adj[L.gps[1]].concat([{ to: dst, w: L.len - ln.along + ROAD_HALF, poly: [...toB.slice().reverse(), { x: ln.x, z: ln.z }] }]);
    }
    const dist = new Float64Array(nodes.length).fill(Infinity), prev = new Int32Array(nodes.length).fill(-1), via = new Array(nodes.length), done = new Uint8Array(nodes.length);
    dist[src] = 0;
    for (;;) {
      let u = -1, best = Infinity; for (let k = 0; k < nodes.length; k++) if (!done[k] && dist[k] < best) { best = dist[k]; u = k; }
      if (u < 0 || u === dst) break;
      done[u] = 1;
      for (const e of adj[u]) { const nd = dist[u] + e.w; if (nd < dist[e.to]) { dist[e.to] = nd; prev[e.to] = u; via[e.to] = e; } }
    }
    if (!isFinite(dist[dst])) return null;
    const chain = []; for (let c = dst; c !== src; c = prev[c]) chain.push(c);
    chain.reverse();
    const out = [];
    for (const c of chain) { const e = via[c]; if (e.poly) out.push(...e.poly); out.push(nodes[c]); }
    return { pts: out, cost: dist[dst], onLink: dst >= G.nodes.length };
  }
};
function gpsRoute(fx, fz, tx, tz) {
  // off the city's square (Valen Point and its causeway): through the spur that reaches it
  if (vpSide(fx, fz) || vpSide(tx, tz)) { const r = GPS.routeAny(fx, fz, tx, tz); if (r) return r; }
  const pts = [{ x: fx, z: fz }];
  let i = clamp(Math.round(fx / P), 0, N), j = clamp(Math.round(fz / P), 0, N);
  const onV = Math.abs(fx - i * P) < 8, onH = Math.abs(fz - j * P) < 8;
  const [gi, gj] = RoadNet.nearNode(tx, tz);
  if (onV && !onH) { j = Math.abs(gj * P - fz) < Math.abs(fz - j * P) ? j : (gj * P > fz ? Math.ceil(fz / P) : Math.floor(fz / P)); }
  if (RoadNet.degree(i, j) === 0) [i, j] = RoadNet.nearNode(fx, fz);
  pts.push({ x: i * P, z: onH ? fz : j * P });
  const viaLinks = Links.list.length ? GPS.route(fx, fz, i, j, tx, tz, gi, gj) : null;
  if (viaLinks) for (const q of viaLinks.pts) pts.push(q);
  else for (const [a, b] of RoadNet.path(i, j, gi, gj).slice(1)) pts.push({ x: a * P, z: b * P });
  pts.push({ x: tx, z: tz });
  return pts;
}

