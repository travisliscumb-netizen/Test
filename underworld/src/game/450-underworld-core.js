/* =====================================================================
   [UNDERWORLD] CORE: owns the crime-world state in save.uw, the strategic
   clock (hour and day ticks; jail days tick the same functions), street
   locations, cash/loot pickups and every hook the engine calls into.
   ===================================================================== */
const UW_VERSION = 1;
// who leads a turf by influence: the rule that used to decide ownership every second. Since §45.13 it only seeds a
// new career's map and the owner of a save from before owners were saved; ownership itself changes only through
// a showdown (Underworld.transferTurf).
function turfLeader(inf, factions) {
  let a = null, av = 0, b = 0;
  for (const k in inf) { if (k !== 'pc' && factions && factions[k] && factions[k].broken) continue; const v = inf[k]; if (v > av) { b = av; av = v; a = k; } else if (v > b) b = v; }
  return av >= 40 && av - b >= 8 ? a : av >= 25 && b >= 25 ? a : av >= 32 ? a : null;
}
// Take Turf (§4): your hold on a turf must reach this much influence, and lead the owner's by the margin, before
// you can call the showdown. Neutral ground needs less.
const TAKE_INF = 40, TAKE_LEAD = 8, TAKE_INF_NEUTRAL = 32;
class CashPickups {
  constructor(g) {
    this.g = g; this.list = [];
    const mat = new THREE.MeshStandardMaterial({ color: 0x3fa45a, emissive: 0x1a5a2a, emissiveIntensity: 0.9, roughness: 0.6 });
    this.mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(0.34, 0.1, 0.18), mat, 40);
    const bagMat = new THREE.MeshStandardMaterial({ color: 0x6a5a3a, emissive: 0x3a2a10, emissiveIntensity: 0.6, roughness: 0.8 });
    this.bags = new THREE.InstancedMesh(new THREE.BoxGeometry(0.34, 0.3, 0.24), bagMat, 20);
    for (const m of [this.mesh, this.bags]) { m.count = 0; m.frustumCulled = false; m.castShadow = true; g.scene.add(m); }
    this._m = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._e = new THREE.Euler(); this._v = new THREE.Vector3(); this._s = new THREE.Vector3(1, 1, 1);
  }
  drop(x, z, cash, goods) {
    if (this.list.length > 50) this.list.shift();
    x += rand(-0.3, 0.3); z += rand(-0.3, 0.3);
    // never inside a wall or a kerb-side prop
    const r = this.g.world.grid.resolveCircle(x, z, 0.35, groundY(x, z) + 0.05, groundY(x, z) + 1.2, this._res || (this._res = {}));
    if (r.hit) { x = r.x; z = r.z; }
    const y = groundY(x, z);
    this.list.push({ x, z, y, cash: Math.round(cash), goods: goods || null, t: 75, age: 0, ph: Math.random() * 6 });
  }
  clear() { this.list.length = 0; }
  update(dt) {
    const g = this.g, p = g.player;
    let nc = 0, nb = 0;
    for (let i = this.list.length - 1; i >= 0; i--) {
      const it = this.list[i]; it.t -= dt; it.age = (it.age || 0) + dt;
      if (it.t <= 0) { this.list.splice(i, 1); continue; }
      const pv = p.state === 'vehicle' ? p.vehicle : null;
      const r = pv ? 2.2 : 1.2;
      // a short beat before it can be scooped up, so a drop is always seen landing
      if (it.age > 0.45 && g.state === 'playing' && !p.interior && (p.state === 'foot' || pv) && dist2(p.pos.x, p.pos.z, it.x, it.z) < r * r && Math.abs(p.pos.y - it.y) < 2) { this.collect(it); this.list.splice(i, 1); continue; }
      const goods = it.goods && units(it.goods) > 0;
      const bob = Math.sin(g.time * 3 + it.ph) * 0.05;
      this._e.set(0, g.time * 1.5 + it.ph, 0); this._q.setFromEuler(this._e);
      this._v.set(it.x, it.y + 0.12 + bob, it.z);
      this._m.compose(this._v, this._q, this._s);
      if (goods && nb < 20) this.bags.setMatrixAt(nb++, this._m);
      else if (nc < 40) this.mesh.setMatrixAt(nc++, this._m);
    }
    this.mesh.count = nc; this.bags.count = nb;
    this.mesh.instanceMatrix.needsUpdate = true; this.bags.instanceMatrix.needsUpdate = true;
  }
  collect(it) {
    const g = this.g, uw = g.uw;
    if (it.cash > 0) { g.earn(it.cash, 'pickup'); }
    let got = '';
    if (it.goods) { const t = uw.give(it.goods, 'pickup'); got = t ? ' + ' + goodsList(t) : ''; }
    g.audio.play('pickup', { gain: 0.6 });
    if (it.cash > 0 || got) g.ui.toast(`Picked up ${it.cash > 0 ? fmtMoney(it.cash) : ''}${got}`, 'money');
  }
}

/* ---------------- neon: the Nightlife Strip (and a few downtown bars) glow after dark ---------------- */
const NEON_WORDS = [['LOUNGE', '#ff3fb4'], ['CABARET', '#ffd84d'], ['KARAOKE', '#46d4c4'], ['DANCE', '#7fb2ff'], ['COCKTAILS', '#ff8a3d'], ['OPEN 24H', '#7fe08f'], ['VELVET', '#e056fd'], ['HOTEL', '#ff4d5e'], ['BAR', '#ffb547'], ['LIVE MUSIC', '#9f7bff'], ['CLUB NEON', '#ff3fb4']];
function neonTexture(word, col) {
  const c = document.createElement('canvas'); c.width = 512; c.height = 128;
  const g = c.getContext('2d');
  g.font = '900 78px Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.shadowColor = col; g.shadowBlur = 26; g.fillStyle = col;
  for (let i = 0; i < 3; i++) g.fillText(word, 256, 66, 480);
  g.shadowBlur = 6; g.fillStyle = '#ffffff'; g.globalAlpha = 0.75; g.fillText(word, 256, 66, 480);
  g.globalAlpha = 1; g.strokeStyle = col; g.lineWidth = 5; g.shadowBlur = 18; g.strokeRect(10, 8, 492, 112);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
class NeonSigns {
  constructor(g) {
    this.g = g; this.meshes = [];
    const rng = mulberry32(4242), groups = {};
    const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3();
    for (const b of g.world.blocks) {
      const zk = ZONE_MAP[b.bz][b.bx];
      const want = zk === 'p' ? 5 : (zk === 'm' || zk === 'o' || zk === 'h') ? (rng() < 0.3 ? 1 : 0) : 0;
      const cand = b.bld.filter(r => r.h > 5 && r.y0 < 1 && r.x1 - r.x0 > 5 && r.z1 - r.z0 > 5);
      for (let k = 0; k < want && cand.length; k++) {
        const r = cand[Math.floor(rng() * cand.length)];
        const gaps = [[r.z0 - b.bz * P, 0], [(b.bx + 1) * P - r.x1, 1], [(b.bz + 1) * P - r.z1, 2], [r.x0 - b.bx * P, 3]].sort((a, c) => a[0] - c[0]);
        const side = gaps[k % 2 === 0 ? 0 : 1][1], u = 0.25 + rng() * 0.5;
        let x, z, ry;
        if (side === 0) { x = lerp(r.x0, r.x1, u); z = r.z0 - 0.14; ry = Math.PI; }
        else if (side === 1) { x = r.x1 + 0.14; z = lerp(r.z0, r.z1, u); ry = Math.PI / 2; }
        else if (side === 2) { x = lerp(r.x0, r.x1, u); z = r.z1 + 0.14; ry = 0; }
        else { x = r.x0 - 0.14; z = lerp(r.z0, r.z1, u); ry = -Math.PI / 2; }
        const y = r.y0 + clamp(r.h * 0.42, 3.4, 7.5);
        const wi = zk === 'p' ? Math.floor(rng() * NEON_WORDS.length) : 8 + Math.floor(rng() * 2);
        const sc = 0.8 + rng() * 0.6;
        _e.set(0, ry, 0); _q.setFromEuler(_e); _m.compose(_p.set(x, y, z), _q, _s.set(sc, sc, 1));
        (groups[wi] = groups[wi] || []).push(_m.clone());
      }
    }
    const geo = new THREE.PlaneGeometry(3.6, 0.9);
    for (const wi in groups) {
      const [word, col] = NEON_WORDS[wi];
      const mat = new THREE.MeshBasicMaterial({ map: neonTexture(word, col), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, side: THREE.DoubleSide });
      const im = new THREE.InstancedMesh(geo, mat, groups[wi].length);
      groups[wi].forEach((m, i) => im.setMatrixAt(i, m));
      im.instanceMatrix.needsUpdate = true; im.computeBoundingSphere();
      im.userData.flicker = rng() < 0.3; im.userData.ph = rng() * 10;
      g.scene.add(im); this.meshes.push(im);
    }
  }
  update(night, t, inside) {
    for (const im of this.meshes) {
      im.visible = !inside;
      let k = 0.25 + night * 1.9;
      if (im.userData.flicker && Math.sin(t * 7 + im.userData.ph) > 0.93) k *= 0.25;
      im.material.color.setScalar(k);
    }
  }
}
class Underworld {
  constructor(game) {
    this.g = game;
    this.market = new Market(this);
    this._buildTurfs();
    this._buildLocations();
    this.pickups = new CashPickups(game);
    this.factions = new FactionSim(this);
    this.gangs = new GangManager(this);
    this.crew = new CrewManager(this);
    this.props = new PropertyManager(this);
    this.armory = new Armory(this);
    this.runs = new DeliveryManager(this);
    this.royalty = new RoyaltySystem(this);
    this.cops = new PressureSystem(this);
    this.prison = new Prison(this);
    this.legal = new Legal(this);
    this.fronts = new Fronts(this);
    this.opps = new OppFeed(this);
    this.fixer = new LaunderFixer(this);
    this.whse = new WarehouseSystem(this);
    this.rivalwh = new RivalWarehouses(this);
    this.compounds = new CompoundSystem(this);
    this.threats = new ThreatSystem(this);
    this.shipments = new ShipmentSystem(this);
    this.ui = new EmpireUI(this);
    this.neon = new NeonSigns(game);
    this.locT = 0; this.statT = 0; this.combatT = 0; this.mapOverlay = true; this.fameT = 20;
    this._infl = 0; this._rank = 0;
    this.bind(game.save);
  }
  get S() { return this.g.save.uw; }
  get inJail() { return !!(this.g.save.uw && this.g.save.uw.jail); }
  // ---------------------------------------------------------------- state
  freshState() {
    const turfs = this.T.map(t => {
      const inf = {};
      const own = START_OWNER[t.zone];
      if (own) inf[own] = 62 + Math.random() * 18;
      if (t.zone === 'w') { inf.vipers = 44 + Math.random() * 6; inf.tidewater = 44 + Math.random() * 6; }
      if (t.zone === 'l') { inf.bellcourt = 12 + Math.random() * 10; }
      return { inf, police: 15 + Math.random() * 15, war: null, own: turfLeader(inf, null), offer: null };
    });
    const factions = {};
    for (const id of FAC_IDS) { const F = FACTIONS[id]; factions[id] = { strength: F.start.strength, money: F.start.money, stock: 60, heat: 20, rel: id === 'vipers' ? -5 : 0, truce: 0, tribute: 0, boss: F.boss.name, bossDown: 0, lt: 0, broken: 0, fear: 0, hits: 0, press: 0, hist: [] }; }
    return {
      v: UW_VERSION, day: 1, lastHour: -1, infamy: 0, pressure: 8, rankMax: 0,
      market: Market.fresh(), marketPrev: null, supply: {}, dealQ: {}, chopWanted: [],
      inv: {}, storage: {}, props: {}, turfs, factions,
      crew: [], nextCrew: 1, cand: [], candDay: 0,
      cops: {}, rap: { priors: 0, cops: 0, copcars: 0, kills: 0 },
      opps: [], nextOpp: 1, ledger: { inc: {}, exp: {} }, lastLedger: null,
      jail: null, jailPhone: false, taskforce: 0, crackdown: 0, redirect: null, pikeCD: 0, hiPressDays: 0, warHours: 0,
      decisions: [], flags: {}, realBy: {}, st: { sold: 0, seizedCash: 0, earnedDeals: 0, turfsTaken: 0, turfsLost: 0, bossesBeaten: 0, picks: 0, chopped: 0, jailDays: 0, seized: 0, realized: 0, runs: 0, runsOk: 0, royalties: 0 },
      slept: false,
      // v2 additions: weapon/armour stashes, crew delivery runs, territory royalties
      wstash: {}, runs: [], runLog: [], nextRun: 1, roy: {},
      // Session 2.5: the economic clock (hours at the reference day length, §45.9) and the laundering fixer
      econH: 0, fixer: LaunderFixer.fresh(),
      // Session 3: warehouse security and settings, and each turf's dealer stock on the corner
      whse: {}, turfStock: {},
      // Session 4A: threats against the player's assets (clocks, strength and dice saved with them)
      threats: ThreatSystem.fresh(),
      // Session 4B: the rival gangs' warehouses (their stock, cash, security, breaches and any raid on)
      rivals: RivalWarehouses.fresh(),
      // every load on the road or at the docks: rival restocks, the Tidewater boat, your imports (cargo saved in it)
      ships: ShipmentSystem.fresh()
    };
  }
  // fill missing / repair invalid fields so one bad value never breaks the save
  sanitize(S) {
    const d = this.freshState();
    const num = (v, def, lo = -Infinity, hi = Infinity) => (typeof v === 'number' && isFinite(v)) ? clamp(v, lo, hi) : def;
    const obj = (v, def) => (v && typeof v === 'object' && !Array.isArray(v)) ? v : def;
    const arr = (v, def) => Array.isArray(v) ? v : def;
    S.v = UW_VERSION;
    S.day = Math.floor(num(S.day, 1, 1, 1e6)); S.lastHour = Math.floor(num(S.lastHour, -1, -1, 23));
    S.infamy = num(S.infamy, 0, 0, 400); S.pressure = num(S.pressure, 8, 0, 100); S.rankMax = Math.floor(num(S.rankMax !== undefined ? S.rankMax : S.stageMax, 0, 0, RANK_MAX)); delete S.stageMax;
    S.market = obj(S.market, d.market);
    for (const z in DEMAND) { S.market[z] = obj(S.market[z], d.market[z]); for (const k of GOOD_IDS) { const m = S.market[z][k]; S.market[z][k] = Array.isArray(m) && m.length === 2 ? [num(m[0], 1, 0.25, 2.6), num(m[1], 1, 0.5, 1.8)] : [1, 1]; } }
    S.marketPrev = obj(S.marketPrev, null);
    S.supply = obj(S.supply, {}); S.dealQ = obj(S.dealQ, {}); S.chopWanted = arr(S.chopWanted, []).filter(t => VEHICLES[t]);
    const goods = o => Inv.clean(o, num);
    S.inv = goods(S.inv);
    S.storage = obj(S.storage, {}); for (const k in S.storage) { if (!PROP_BY_ID[k]) delete S.storage[k]; else S.storage[k] = goods(S.storage[k]); }
    S.props = obj(S.props, {}); for (const k in S.props) { const pr = S.props[k]; if (!PROP_BY_ID[k] || !pr || typeof pr !== 'object') { delete S.props[k]; continue; } pr.owned = !!pr.owned; pr.dmg = num(pr.dmg, 0, 0, 1); pr.since = num(pr.since, 1); pr.lvl = Math.floor(num(pr.lvl, 1, 1, 3)); }
    S.turfs = arr(S.turfs, d.turfs);
    if (S.turfs.length !== this.T.length) S.turfs = d.turfs;
    S.turfs = S.turfs.map((t, i) => {
      t = obj(t, d.turfs[i]);
      const inf = {}; const src = obj(t.inf, {});
      for (const k in src) if ((FACTIONS[k] || k === 'pc')) { const v = num(src[k], 0, 0, 100); if (v > 0.01) inf[k] = v; }
      const w = t.war && typeof t.war === 'object' && (FACTIONS[t.war.a] || t.war.a === 'pc') ? { a: t.war.a, d: t.war.d === 'pc' || FACTIONS[t.war.d] ? t.war.d : null, hrs: num(t.war.hrs, 12, 0, 200) } : null;
      // the owner is saved state (§45.13). A save from before it was (schema < 9) takes the owner its influence
      // showed at the time, once, by the old rule; after that only a showdown changes it.
      const own = t.own === 'pc' || FACTIONS[t.own] || t.own === null ? t.own : undefined;
      const offer = t.offer && typeof t.offer === 'object' && FACTIONS[t.offer.fid] ? { fid: t.offer.fid, until: num(t.offer.until, 0, 0, 1e6) } : null;
      return { inf, police: num(t.police, 15, 0, 100), war: w && w.a !== w.d ? w : null, own, offer };
    });
    S.factions = obj(S.factions, d.factions);
    for (const id of FAC_IDS) {
      const f = S.factions[id] = obj(S.factions[id], d.factions[id]), df = d.factions[id];
      f.strength = num(f.strength, df.strength, 0, 120); f.money = num(f.money, df.money, 0, 1e8); f.stock = num(f.stock, 60, 0, 1e5); f.heat = num(f.heat, 20, 0, 100);
      f.rel = num(f.rel, 0, -100, 100); f.aggro = num(f.aggro, 0, 0, 100); f.trouble = num(f.trouble, 0, 0, 10); f.truce = num(f.truce, 0, 0, 1e6); f.tribute = num(f.tribute, 0, 0, 1e5); f.bossDown = num(f.bossDown, 0, 0, 60);
      f.lt = Math.floor(num(f.lt, 0, 0, 99)); f.broken = num(f.broken, 0, 0, 1e6); f.fear = num(f.fear, 0, 0, 100); f.hits = num(f.hits, 0, 0, 1e6);
      f.press = num(f.press, 0, 0, 100); f.hist = arr(f.hist, []).filter(h => h && typeof h === 'object').slice(-10);
      if (typeof f.boss !== 'string' || !f.boss) f.boss = FACTIONS[id].boss.name;
    }
    // owners missing from an older save: derived once, now that faction state (broken or not) is known
    for (const t of S.turfs) if (t.own === undefined) t.own = turfLeader(t.inf, S.factions);
    S.crew = arr(S.crew, []).filter(c => c && typeof c === 'object' && typeof c.name === 'string').map(c => this.crew.sanitizeMember(c));
    S.nextCrew = Math.max(num(S.nextCrew, 1, 1), ...S.crew.map(c => c.id + 1), 1);
    S.cand = arr(S.cand, []).filter(c => c && typeof c.name === 'string').map(c => this.crew.sanitizeMember(c)); S.candDay = num(S.candDay, 0);
    S.cops = obj(S.cops, {}); for (const k in S.cops) { if (!OFFICER_BY_ID[k] || !S.cops[k] || typeof S.cops[k] !== 'object') delete S.cops[k]; else { const c = S.cops[k]; if (!['paid', 'refused', 'burned'].includes(c.st)) c.st = 'refused'; c.due = num(c.due, 0); c.until = num(c.until, 0); } }
    S.rap = obj(S.rap, d.rap); for (const k in d.rap) S.rap[k] = Math.floor(num(S.rap[k], 0, 0, 1e5));
    S.opps = arr(S.opps, []).filter(o => o && typeof o === 'object' && typeof o.title === 'string').slice(-30); S.nextOpp = num(S.nextOpp, 1, 1);
    S.ledger = obj(S.ledger, { inc: {}, exp: {} }); S.ledger.inc = obj(S.ledger.inc, {}); S.ledger.exp = obj(S.ledger.exp, {}); S.lastLedger = obj(S.lastLedger, null);
    if (S.jail && typeof S.jail === 'object') {
      Prison.sanitize(S.jail, num);
      if (S.jailPhone === true && S.jail.phone === undefined) S.jail.phone = true;
      S.jail.phone = !!S.jail.phone;
    } else S.jail = null;
    // v6: there is no phone that survives from one sentence to the next (a smuggled phone is per sentence)
    S.jailPhone = false; S.taskforce = num(S.taskforce, 0, 0, 60); S.crackdown = num(S.crackdown, 0, 0, 60);
    S.redirect = FACTIONS[S.redirect] ? S.redirect : null; S.pikeCD = num(S.pikeCD, 0, 0, 60); S.hiPressDays = num(S.hiPressDays, 0, 0, 999); S.warHours = num(S.warHours, 0, 0, 1e5);
    S.decisions = arr(S.decisions, []).filter(x => x && typeof x === 'object' && typeof x.text === 'string').slice(-6);
    S.dayOffset = Math.floor(num(S.dayOffset, 0, 0, Math.max(0, S.day - 1))); S.fit = Math.floor(num(S.fit, 0, 0, 5));
    S.fugitive = S.fugitive && typeof S.fugitive === 'object' ? { left: Math.floor(num(S.fugitive.left, 0, 0, SENTENCE_MAX)), day: num(S.fugitive.day, 0) } : null;
    S.flags = obj(S.flags, {}); S.st = obj(S.st, d.st); for (const k in d.st) S.st[k] = num(S.st[k], 0, k === 'realized' ? -1e9 : 0, 1e9);
    S.econH = num(S.econH, 0, 0, 1e9); S.fixer = LaunderFixer.sanitize(S.fixer, num);
    S.legal = Legal.sanitize(S.legal, num, S.rap);
    S.fronts = Fronts.sanitize(S.fronts, num);
    S.whse = WarehouseSystem.sanitize(S.whse, num);
    S.threats = ThreatSystem.sanitize(S.threats, num);
    S.rivals = RivalWarehouses.sanitize(S.rivals, num);
    S.turfStock = obj(S.turfStock, {}); for (const k in S.turfStock) { if (!(+k >= 0 && +k < this.T.length)) delete S.turfStock[k]; else S.turfStock[k] = goods(S.turfStock[k]); }
    S.realBy = obj(S.realBy, {}); for (const k in S.realBy) { if (!GOODS[k]) delete S.realBy[k]; else S.realBy[k] = num(S.realBy[k], 0, -1e9, 1e9); }
    S.slept = !!S.slept;
    S.ships = ShipmentSystem.sanitize(S.ships, num); ShipmentSystem.migrate(S);
    // stashes of weapons/ammo/armour at owned (or once-owned) properties
    S.wstash = obj(S.wstash, {});
    for (const id in S.wstash) {
      if (!PROP_BY_ID[id]) { delete S.wstash[id]; continue; }
      const w = obj(S.wstash[id], freshWStash()), a = obj(w.ammo, {});
      S.wstash[id] = { ammo: { pistol: Math.floor(num(a.pistol, 0, 0, 1e5)), smg: Math.floor(num(a.smg, 0, 0, 1e5)), shotgun: Math.floor(num(a.shotgun, 0, 0, 1e5)) }, vests: arr(w.vests, []).map(v => num(v, 0, 0, VEST_MAX)).filter(v => v >= 1).slice(0, 40) };
    }
    S.runs = arr(S.runs, []).map(r => this.runs.sanitizeRun(r, num)).filter(Boolean).slice(0, 12);
    S.runLog = arr(S.runLog, []).filter(r => r && typeof r === 'object' && typeof r.outcome === 'string').slice(-20);
    S.nextRun = Math.max(num(S.nextRun, 1, 1), ...S.runs.map(r => r.id + 1), 1);
    S.roy = obj(S.roy, {}); for (const k in S.roy) { const r = S.roy[k]; if (!(+k >= 0 && +k < this.T.length) || !r || typeof r !== 'object') { delete S.roy[k]; continue; } r.owed = num(r.owed, 0, 0, 1e7); r.late = Math.floor(num(r.late, 0, 0, 30)); r.status = ['paid', 'late', 'under', 'refused', 'challenge', 'none'].includes(r.status) ? r.status : 'none'; r.payer = FACTIONS[r.payer] ? r.payer : null; r.last = num(r.last, 0, 0, 1e7); }
    return S;
  }
  bind(save) {
    if (!save.uw || typeof save.uw !== 'object') save.uw = this.freshState();
    this.sanitize(save.uw);
    for (const k of ARMORY_GUNS) if (save.wloc && save.wloc[k] && !PROP_BY_ID[save.wloc[k]]) save.wloc[k] = null;
    this.owner = new Array(this.T.length).fill(null); this.contested = new Array(this.T.length).fill(false);
    this.recompute();
    this.gangs.reset(); this.crew.reset(); this.pickups.clear(); this.opps.rebuildMarkers();
    if (this.compounds) this.compounds.reset();
    if (this.threats) this.threats.reset();
    if (this.rivalwh) this.rivalwh.reset();
    if (this.shipments) this.shipments.reset();
    if (this.g.vreg) this.g.vreg.reset();
    if (this.g.uniques) this.g.uniques.reset();
    if (this.g.pinks) this.g.pinks.reset();
    if (this.g.wash) this.g.wash.reset();
    if (this.g.motorsport) this.g.motorsport.reset();
    if (this.g.offroad) this.g.offroad.reset();
    if (!this.S.chopWanted.length) this.rollChopList();
    if (!this.S.marketPrev) this.market.snapshot();
  }
  // ---------------------------------------------------------------- geography
  _buildTurfs() {
    this.T = [];
    for (let tz = 0; tz < TURF_N; tz++) for (let tx = 0; tx < TURF_N; tx++) {
      const blocks = [[tx * 2, tz * 2], [tx * 2 + 1, tz * 2], [tx * 2, tz * 2 + 1], [tx * 2 + 1, tz * 2 + 1]];
      const cnt = {}; for (const [bx, bz] of blocks) { const k = ZONE_MAP[bz][bx]; cnt[k] = (cnt[k] || 0) + 1; }
      let zone = blocks.map(([bx, bz]) => ZONE_MAP[bz][bx]).sort((a, b) => cnt[b] - cnt[a])[0];
      const i = tz * TURF_N + tx;
      const rng = mulberry32(i * 7919 + 17);
      // hangout: a sidewalk corner on one of the turf's blocks (never a special/landmark block)
      // corners on real sidewalks: never a landmark, a special block or inside a superblock
      const free = blocks.filter(([bx, bz]) => !superblockAt(bx, bz));
      const ok = free.filter(([bx, bz]) => !LANDMARK_BLOCKS[bx + ',' + bz] && !Object.values(SPECIAL).some(s => s.bx === bx && s.bz === bz));
      const pool = ok.length ? ok : free.length ? free : blocks;
      const hb = pool[Math.floor(rng() * pool.length)];
      // sidewalkSpot sides are 0 N, 1 E, 2 S, 3 W; only sides that face a road that exists
      const sides = (bx, bz) => { const o = [0, 1, 2, 3].filter(sd => RoadNet.sideOpen(bx, bz, [0, 3, 1, 2][sd])); return o.length ? o : [0]; };
      const hs = sides(hb[0], hb[1]);
      const hang = sidewalkSpot(hb[0], hb[1], hs[Math.floor(rng() * hs.length)], 18 + rng() * 44);
      const db = pool[Math.floor(rng() * pool.length)], ds = sides(db[0], db[1]);
      const deal = sidewalkSpot(db[0], db[1], ds[Math.floor(rng() * ds.length)], 14 + rng() * 52);
      this.T.push({ i, tx, tz, zone, blocks, cx: tx * 2 * P + P, cz: tz * 2 * P + P, hang, deal, name: '' });
    }
    // names: each district hands out its own street names in order
    const used = {};
    for (const t of this.T) { const list = TURF_NAMES[t.zone]; const k = used[t.zone] = (used[t.zone] || 0); t.name = list[k % list.length] + (k >= list.length ? ' ' + (Math.floor(k / list.length) + 1) : ''); used[t.zone]++; }
  }
  turfNeighbors(i) { const tx = i % TURF_N, tz = Math.floor(i / TURF_N), out = []; for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const x = tx + dx, z = tz + dz; if (x >= 0 && z >= 0 && x < TURF_N && z < TURF_N) out.push(z * TURF_N + x); } return out; }
  _buildLocations() {
    const g = this.g, pl = g.world.places;
    // a kerbside door point; where the building stands back from the pavement (a forecourt, a car park, a
    // set-back frontage) the door moves up to the facade, so you walk to the building's real door and the
    // dressing (door leaf, canopy, name board) is built where you stand
    const grid = g.world.grid, at = (a, o) => {
      const s = sidewalkSpot(a[0], a[1], a[2], a[3], o), fx = Math.sin(s.h), fz = Math.cos(s.h), y = groundY(s.x, s.z, CURB_H + 1) + 1.2;
      const hit = grid.raycast(s.x, y, s.z, -fx, 0, -fz, 14, 0.6);
      if (hit && hit.t > 3) { s.x -= fx * (hit.t - 1.3); s.z -= fz * (hit.t - 1.3); s.setback = +(hit.t - 1.3).toFixed(2); }
      return s;
    };
    this.locs = [];
    for (const pr of PROPS) {
      let door;
      const hm = pr.home && g.world.homes.find(h => h.id === pr.home);
      if (pr.place && pl[pr.place]) { const d = pl[pr.place].door; door = { x: d.x, z: d.z, h: d.h }; }
      else if (hm) door = { x: hm.door.x, z: hm.door.z, h: hm.door.h };
      else door = at(pr.at, ROAD_HALF + 3.1);
      // a flat behind a street door enters and exits where the door now is
      if (!hm && pr.home && door.setback) { const f = (g.world.flats || []).find(x => x.id === pr.home); if (f) f.door = { x: door.x, z: door.z, h: door.h }; }
      this.locs.push({ kind: 'prop', id: pr.id, def: pr, x: door.x, z: door.z, h: door.h, zone: zoneKey(door.x, door.z), col: 0xffffff, setback: door.setback || 0 });
    }
    for (const s of SPOTS) {
      let p0;
      if (s.place && pl[s.place]) p0 = { ...pl[s.place].door }; else p0 = at(s.at, ROAD_HALF + 2.6);
      this.locs.push({ kind: 'spot', id: s.id, def: s, x: p0.x, z: p0.z, h: p0.h, zone: zoneKey(p0.x, p0.z), col: s.col });
    }
    for (const fid of FAC_IDS) { const p0 = at(HQS[fid], ROAD_HALF + 2.6); this.locs.push({ kind: 'hq', id: fid, def: FACTIONS[fid], x: p0.x, z: p0.z, h: p0.h, zone: zoneKey(p0.x, p0.z), col: FACTIONS[fid].hex }); }
    // deal corners: one per turf in districts with street demand
    for (const t of this.T) this.locs.push({ kind: 'deal', id: 'deal' + t.i, turf: t.i, x: t.deal.x, z: t.deal.z, h: t.deal.h, zone: t.zone, col: 0xd28cff });
    // nudge every location out of any prop/collider it landed on
    const res = {};
    for (const L of this.locs) for (let k = 0; k < 8; k++) { const r = g.world.grid.resolveCircle(L.x, L.z, 0.6, CURB_H + 0.2, CURB_H + 1.6, res); if (!r.hit) break; L.x = r.x; L.z = r.z; }
    this.locById = {}; for (const L of this.locs) this.locById[L.kind + ':' + L.id] = L;
    this.markers = this.locs.filter(L => L.kind !== 'deal').map(L => ({ L, m: null }));
  }
  loc(kind, id) { return this.locById[kind + ':' + id]; }
  // ---------------------------------------------------------------- territory
  // ownership is saved state (S.turfs[i].own, §45.13); `owner` is its read view, refreshed here and by
  // transferTurf. Influence never changes the owner: it only shows how firm the hold is (contested) and decides
  // when a challenger may call a showdown.
  recompute() {
    const S = this.S;
    for (let i = 0; i < this.T.length; i++) {
      const T = S.turfs[i], own = T.own, inf = T.inf, mine = own ? inf[own] || 0 : 0;
      this.owner[i] = own;
      let cont = !!T.war;
      if (!cont) for (const k in inf) if (k !== own && (k === 'pc' || (S.factions[k] && !S.factions[k].broken)) && inf[k] >= 25 && inf[k] >= mine - TAKE_LEAD) { cont = true; break; }
      this.contested[i] = cont;
      if (T.offer && (T.offer.until < S.day || T.offer.fid !== own)) T.offer = null;
    }
  }
  // the one place a turf changes hands: the end of a showdown the challenger won, or a turf its owner handed you
  // when you took it up on the offer
  transferTurf(i, to, cause) {
    const T = this.S.turfs[i], prev = T.own;
    if (to === prev || !(to === 'pc' || FACTIONS[to] || to === null)) return false;
    T.own = to; T.offer = null; this.owner[i] = to;
    this.recompute();
    this.onTurfChange(i, prev, to, cause);
    return true;
  }
  // can the player call Take Turf here? { ok, why, offered }
  takeCheck(i) {
    const S = this.S, T = S.turfs[i]; if (!T) return { ok: false, why: 'No such turf.' };
    const own = T.own, f = own && own !== 'pc' ? S.factions[own] : null, pc = T.inf.pc || 0, theirs = own ? T.inf[own] || 0 : 0;
    if (own === 'pc') return { ok: false, why: 'It’s already yours.' };
    if (this.inJail) return { ok: false, why: 'Not from a cell.' };
    if (T.war) return { ok: false, why: T.war.a === 'pc' ? 'Your showdown is already on.' : 'There’s already a war on here. Let it settle.' };
    if (T.offer && T.offer.fid === own) return { ok: true, offered: true, why: '' };
    if (f && f.truce > S.day) return { ok: false, why: `You have a truce with the ${FACTIONS[own].short}.` };
    const need = own ? Math.max(TAKE_INF, theirs + TAKE_LEAD) : TAKE_INF_NEUTRAL;
    if (pc < need) return { ok: false, need, why: `Weaken their hold first: you need ${Math.ceil(need)} influence here (you have ${Math.floor(pc)}). Beat their people on this turf or send an Enforcer to lean on it.` };
    return { ok: true, offered: false, why: '' };
  }
  // Take Turf (§4): call the showdown. Played live if you are there, otherwise your people on the turf fight it
  // out (FactionSim.warStep). A turf its owner offered you changes hands without a fight.
  takeTurf(i) {
    const c = this.takeCheck(i); if (!c.ok) return c.why;
    const S = this.S, T = S.turfs[i], t = this.T[i], own = T.own;
    if (c.offered) { this.transferTurf(i, 'pc', 'ceded'); return ''; }
    T.war = { a: 'pc', d: own, hrs: 6 + Math.random() * 4 };
    this.recompute();
    this.opps.add({ kind: 'war', title: `Showdown for ${t.name}`, text: `You called it: ${own ? 'the ' + FACTIONS[own].short + ' have to hold ' + t.name + ' or lose it' : t.name + ' is up for grabs'}. Be there to fight it yourself, or your Enforcers on the turf handle it.`, turf: i, x: t.hang.x, z: t.hang.z, hours: Math.ceil(T.war.hrs), urgent: true });
    this.news('pv', `You made your move on ${t.name}${own ? '. The ' + FACTIONS[own].short + ' know it' : ''}.`);
    this.g.audio.play('wanted');
    return '';
  }
  onTurfChange(i, prev, own) {
    const g = this.g, t = this.T[i], S = this.S;
    const nm = x => x === 'pc' ? 'you' : x ? FACTIONS[x].short : 'nobody';
    if (own === 'pc') {
      // taking a gang's turf is the biggest grievance there is (Session 4A pressure)
      if (prev && FACTIONS[prev]) this.threats.press(prev, PRESSURE.take, `took ${t.name}`);
      S.st.turfsTaken++; this.addRep(60, null); S.infamy = Math.min(400, S.infamy + 12);
      g.ui.banner('Turf Taken', `${t.name} · ${ZONES[t.zone].name}`, 'pass', 3.2); g.audio.play('pass');
      this.news('pv', `Word is ${t.name} answers to you now${prev ? ', not the ' + FACTIONS[prev].short : ''}. Put an Enforcer and a Dealer on it (Empire → Crew) and keep it supplied.`);
      g.autosave('Territory taken');
    } else if (prev === 'pc') {
      S.st.turfsLost++;
      g.ui.banner('Turf Lost', `${t.name} → ${nm(own)}`, 'fail', 3); g.audio.play('fail');
      this.news('pv', `You lost ${t.name} to ${nm(own)}.`);
    } else if (own && prev && dist2(g.player.pos.x, g.player.pos.z, t.cx, t.cz) < 400 * 400) {
      g.ui.toast(`${FACTIONS[own] ? FACTIONS[own].short : 'Someone'} took ${t.name} from the ${FACTIONS[prev] ? FACTIONS[prev].short : 'locals'}.`, 'radio');
    }
    if (prev && FACTIONS[prev] && own !== prev) this.opps.add({ kind: 'instability', title: `${FACTIONS[prev].short} lost ${t.name}`, text: `${t.name} (${ZONES[t.zone].name}) is up for grabs. Rival influence there is weak.`, turf: i, x: t.hang.x, z: t.hang.z, hours: 30 });
  }
  addInf(i, who, v) {
    if (i < 0 || i >= this.T.length) return;
    const inf = this.S.turfs[i].inf;
    inf[who] = clamp((inf[who] || 0) + v, 0, 100);
    if (inf[who] < 0.01) delete inf[who];
  }
  playerTurfs() { let n = 0; for (const o of this.owner) if (o === 'pc') n++; return n; }
  factionTurfs(fid) { let n = 0; for (const o of this.owner) if (o === fid) n++; return n; }
  // ---------------------------------------------------------------- player power
  get influence() { return this._infl; }
  // the career calendar shown to the player (internal day numbers keep counting from day 1; a v4 jail
  // inflated them, and that inflation is not shown)
  get calDay() { return Math.max(1, this.S.day - (this.S.dayOffset || 0)); }
  get rank() { return this._rank; }
  // the measures Rank reads (RANKS[n].need): nothing here can be bought (§1, §45.7)
  power() {
    const S = this.S, crew = S.crew.filter(c => c.status === 'active');
    return { rep: this.g.save.rep, crew: crew.length, lts: crew.filter(c => c.role === 'lieutenant').length, turfs: this.playerTurfs(), infl: this._infl, wh: this.whse.operatingCount() };
  }
  // the highest Rank whose conditions, and every lower Rank's, are all met
  rankOf(pw) {
    let r = 0;
    for (let n = 1; n <= RANK_MAX; n++) { const need = RANKS[n].need; if (Object.keys(need).every(k => (pw[k] || 0) >= need[k])) r = n; else break; }
    return r;
  }
  // what the next Rank still needs, as text
  rankMissing(pw = this.power()) {
    const n = Math.min(RANK_MAX, this._rank + 1), need = RANKS[n].need;
    return Object.keys(need).filter(k => (pw[k] || 0) < need[k]).map(k => RANK_NEED_TEXT[k](need[k]));
  }
  computeInfluence() {
    const S = this.S;
    const turfs = this.playerTurfs();
    // a business adds influence only once it is established (§45.7); homes and their neighbourhoods add none,
    // because a purchase never buys influence (§1)
    let bizInfl = 0;
    for (const id in S.props) if (S.props[id].owned) { const d = PROP_BY_ID[id]; if (d && d.kind === 'business') bizInfl += (BIZ_INFL + (d.infl || 0)) * this.props.established(id); }
    bizInfl += this.props.perk('infl');
    const crew = S.crew.filter(c => c.status === 'active');
    const lts = crew.filter(c => c.rank >= 3).length;
    const cops = Object.values(S.cops).filter(c => c.st === 'paid').length;
    this._infl = Math.round(clamp(turfs * 22 + bizInfl + crew.length * 5 + lts * 12 + cops * 8 + S.infamy, 0, 1000));
    const r = this._rank = this.rankOf(this.power());
    if (r > S.rankMax) {
      S.rankMax = r;
      if (this._booted) {
        this.g.later(1200, () => { this.g.ui.banner(RANKS[r].name, r < RANK_MAX ? 'Next: ' + RANKS[r].hint : 'The city is yours. Hold it.', 'pass', 4.5); this.g.audio.play('pass'); });
        this.news('pv', this.rankLine(r));
      }
    }
    this._booted = true;
  }
  rankLine(st) {
    return ['', 'Street talk: a new face is hustling around the Old Quarter.', 'Your name is coming up in back rooms. People know who to call.', 'You run a crew now. The gangs have noticed.', 'You hold ground. Rival bosses are asking who you are.', 'Half the underworld answers to you. The rest are scared.', 'Port Valen has a new kingpin. Everyone knows it.'][st] || '';
  }
  addRep(n, why) { if (this.g.content) this.g.content.addRep(n, why); }
  // how a faction's people treat the player right now
  attitude(fid) {
    const S = this.S, f = S.factions[fid];
    if (!f || f.broken) return 'neutral';
    if (f.truce > S.day) return f.tribute > 0 ? 'friendly' : 'neutral';
    const facPow = f.strength * 5 + this.factionTurfs(fid) * 40 + 20;
    const ratio = this._infl / facPow;
    if (f.rel <= -40) return ratio > 2.2 ? 'fearful' : 'hostile';
    if (ratio > 2.2) return 'fearful';
    if (f.rel >= 40) return 'friendly';
    if (this._rank >= 2 && ratio > 0.8) return 'wary';
    return 'territorial';
  }
  powerRatio(fid) { const f = this.S.factions[fid]; return this._infl / (f.strength * 5 + this.factionTurfs(fid) * 40 + 20); }
  // the top Rank: everybody on the street knows who runs the city (§31: a multi-system state, not a number)
  kingpin() { return this._rank >= RANK_MAX; }
  // ---------------------------------------------------------------- inventory
  get pockets() { return this.S.inv; }
  pocketFree() { return POCKET_CAP - units(this.S.inv); }
  // every place goods can be, with its location class, capacity and the district it is valued in. here = within
  // reach right now (goods can be moved by hand); everything else is listed read-only (opts.all) and only crew runners
  // move it. Vehicles measure cargo in pounds (lb: true, capC in hundredths of a pound); the rest in space units.
  locations(opts = {}) {
    const S = this.S, g = this.g, out = [], pz = zoneKey(g.player.pos.x, g.player.pos.z), acc = this.access(), seen = new Set();
    out.push({ key: 'inv', cls: 'ON PERSON', name: 'Pockets', o: S.inv, cap: POCKET_CAP, zone: pz, here: true });
    for (const t of acc.trunks) { seen.add(t.o); out.push({ key: t.key, cls: 'VEHICLE', name: `${VEHICLES[t.type].name} trunk${t.where ? ' · ' + t.where : ''}`, o: t.o, lb: true, type: t.type, capC: cargoCapC(t.type), zone: t.zone, here: true, veh: t.v || null, uid: t.uid || 0 }); }
    if (opts.all) for (const e of g.save.garage) if (e.trunk && units(e.trunk) && !seen.has(e.trunk)) { seen.add(e.trunk); const at = e.at && PROP_BY_ID[e.at.p]; out.push({ key: 'car:' + e.uid, cls: 'VEHICLE', name: `${VEHICLES[e.type].name} trunk${at ? ' · ' + at.name : ''}`, o: e.trunk, lb: true, type: e.type, capC: cargoCapC(e.type), zone: at && this.loc('prop', at.id) ? this.loc('prop', at.id).zone : pz, here: false, uid: e.uid }); }
    // a car you are not keeping (a stolen hauler) that you walked away from: its cargo is still yours, out there
    const lv = g.player.lastVehicle;
    if (opts.all && lv && lv.trunk && units(lv.trunk) && !seen.has(lv.trunk) && !lv.burnt && g.vehicles.list.includes(lv)) { seen.add(lv.trunk); out.push({ key: 'last', cls: 'VEHICLE', name: `${lv.spec.name} trunk · where you left it`, o: lv.trunk, lb: true, type: lv.type, capC: cargoCapC(lv.type), zone: zoneKey(lv.pos.x, lv.pos.z), here: false, veh: lv }); }
    for (const d of this.props.ownedList()) {
      const cap = this.props.storageCap(d.id), here = acc.props.has(d.id); if (!cap || (!here && !opts.all)) continue;
      const L = this.loc('prop', d.id);
      out.push({ key: 'p:' + d.id, cls: LOC_CLASS[d.kind] || 'PROPERTY', name: d.name, o: S.storage[d.id] || (S.storage[d.id] = {}), cap, zone: L ? L.zone : pz, prop: d.id, here });
    }
    // a dealer's corner (§4, §8): stock you hand over in person there, for your Dealers on that turf to sell. Before
    // you have a warehouse and Drivers, this is how a turf is supplied.
    const p = g.player, inside = !!p.interior;
    for (let i = 0; i < this.T.length; i++) {
      if (!this.whse.dealersOn(i).length) continue;
      const t = this.T[i], here = !inside && dist2(t.deal.x, t.deal.z, p.pos.x, p.pos.z) < 7 * 7, o = this.whse.turfStock(i);
      if (!here && !(opts.all && units(o))) continue;
      out.push({ key: 'turf:' + i, cls: 'CORNER', name: `Dealer’s corner · ${t.name}`, o, cap: TURF_STOCK_CAP, zone: t.zone, turf: i, here });
    }
    // a rival's stock, while you can reach it (inside their building, or a car of yours in their loading bay)
    for (const fid in RIVAL_WH) if (this.rivalwh.reach(fid)) out.push(this.rivalwh.location(fid));
    out.sort((a, b) => LOC_ORDER.indexOf(a.cls) - LOC_ORDER.indexOf(b.cls) || (b.here - a.here));
    return out;
  }
  // where the player is for reach purposes: the street outside when in a house, the spot itself otherwise
  anchor() {
    const p = this.g.player, I = p.interior;
    if (I && I.vspace) { const D = this.g.vspaces && this.g.vspaces.cur; return { x: p.pos.x, z: p.pos.z, y: p.pos.y, prop: D ? D.prop : null, under: true }; }
    if (I && I.def && I.def.door) { const pd = I.def.propId || (PROPS.find(d => d.interior === I.id) || {}).id || null; return { x: I.def.door.x, z: I.def.door.z, y: groundY(I.def.door.x, I.def.door.z), prop: pd, inside: true }; }
    return { x: p.pos.x, z: p.pos.z, y: p.pos.y, prop: null };
  }
  // what is within reach right now: owned stashes you are at, the car you are in or beside, and the cars in that
  // property's own bays (its garage). A car outside a house counts while you are indoors; nothing across town does.
  access() {
    const g = this.g, p = g.player, A = this.anchor(), props = new Set(), trunks = [], seen = new Set();
    const PM = this.props;
    if (A.prop && PM.owned(A.prop)) props.add(A.prop);
    // a car in one of a warehouse's dock bays is at the warehouse (the loading bay)
    if (!A.inside && !A.under) { const wd = this.compounds.dockAt(A.x, A.z); if (wd && PM.owned(wd)) props.add(wd); }
    if (!A.inside && !A.under) for (const d of PM.ownedList()) {
      if (props.has(d.id) || !PM.storageCap(d.id)) continue;
      const L = this.loc('prop', d.id);
      if (L && dist2(L.x, L.z, A.x, A.z) < 12 * 12) { props.add(d.id); continue; }
      for (const b of PM.bays(d)) if (b.kind !== 'under' && dist2(b.x, b.z, A.x, A.z) < 9 * 9 && Math.abs((b.y || 0) - A.y) < 4) { props.add(d.id); break; }
    }
    const zone = (x, z) => zoneKey(x, z);
    const addV = (v, why) => {
      if (!v || v.burnt || !g.vehicles.list.includes(v) || !(CARGO_LB[v.type] > 0) || v.dealer) return;
      if (!v.trunk) v.trunk = {};
      if (seen.has(v.trunk)) return; seen.add(v.trunk);
      trunks.push({ key: v.garageUid ? 'car:' + v.garageUid : 'veh', o: v.trunk, type: v.type, v, uid: Money.uidOf(v), zone: zone(v.pos.x, v.pos.z), where: why || '' });
    };
    const reach = A.inside ? 24 : 14;
    const cur = p.state === 'vehicle' ? p.vehicle : null;
    if (cur && !A.inside) addV(cur);
    const lv = p.lastVehicle;
    if (lv && lv !== cur && dist2(lv.pos.x, lv.pos.z, A.x, A.z) < reach * reach && Math.abs(lv.pos.y - A.y) < 6) addV(lv);
    // your own cars parked beside you (or out front while you are inside)
    for (const v of g.vehicles.nearby(A.x, A.z, reach)) if (v.garageUid && v !== cur && Math.abs(v.pos.y - A.y) < 6) addV(v);
    // cars stored in the bays of a property you are at: its garage is part of the house
    for (const e of g.save.garage) {
      if (!e.at || e.out || !props.has(e.at.p) || !(CARGO_LB[e.type] > 0) || e.dmg >= 100) continue;
      if (!e.trunk) e.trunk = {};
      if (seen.has(e.trunk)) continue; seen.add(e.trunk);
      const L = this.loc('prop', e.at.p);
      trunks.push({ key: 'car:' + e.uid, o: e.trunk, type: e.type, v: null, uid: e.uid, zone: L ? L.zone : zone(A.x, A.z), where: PROP_BY_ID[e.at.p].name });
    }
    return { props, trunks, anchor: A };
  }
  // the one car "with you" for buying and selling on the street: the one you are in, or the last one you drove
  // when it is beside you
  nearVehicle(r = 14) {
    const p = this.g.player, v = p.state === 'vehicle' ? p.vehicle : p.lastVehicle;
    if (!v || v.burnt || !this.g.vehicles.list.includes(v) || !(CARGO_LB[v.type] > 0)) return null;
    if (p.state !== 'vehicle' && dist2(v.pos.x, v.pos.z, p.pos.x, p.pos.z) > r * r) return null;
    if (!v.trunk) v.trunk = {};
    return v;
  }
  // lots of good k that still fit in a vehicle's trunk (cargo is weighed in pounds)
  trunkFit(v, k) { return cargoFit(v.type, v.trunk, k); }
  // lots of good k that fit in a location from locations()
  fitIn(L, k) {
    if (L.lb) return cargoFit(L.type, L.o, k);
    const free = L.key === 'inv' ? this.pocketFree() : L.prop ? this.props.storageFree(L.prop) : L.cap - units(L.o);
    return Math.max(0, Math.floor(free / GOODS[k].size));
  }
  // move up to n lots of good k between two reachable locations (by key). Never creates or destroys product:
  // the amount is capped by what the source holds and what fits; the cost basis travels with the goods.
  transfer(fromKey, toKey, k, n) {
    if (!GOODS[k] || fromKey === toKey) return 0;
    const locs = this.locations(), A = locs.find(L => L.key === fromKey && L.here), B = locs.find(L => L.key === toKey && L.here);
    if (!A || !B || A.o === B.o) return 0;
    // their stock is taken from, never added to; taking from it is noticed (Session 4B)
    if (B.rival) return 0;
    if (B.turf !== undefined && (GOODS[k].fence || GOODS[k].arms)) return 0; // dealers sell product, not hot goods or hardware
    const m = Math.min(Math.floor(n), Inv.has(A.o, k), this.fitIn(B, k)); if (!(m > 0)) return 0;
    const moved = Inv.move(A.o, B.o, k, m);
    if (moved && A.rival) this.rivalwh.touched(A.rival);
    return moved;
  }
  // move Dirty Cash between two places within reach (§2): your pockets, a trunk, a safehouse stash or a warehouse
  // vault. n < 0 moves all of it. Places across town are out of reach, exactly as for product.
  transferCash(fromKey, toKey, n) {
    if (fromKey === toKey) return 0;
    const locs = this.locations(), A = locs.find(L => L.key === fromKey && L.here), B = locs.find(L => L.key === toKey && L.here);
    if (!A || !B) return 0;
    return Money.move(A, B, n < 0 ? Money.cashAt(A) : n);
  }
  // put goods on the player: pockets first, then a nearby trunk. returns what fit.
  // unitCost: dollars paid per lot (purchases); found / stolen goods come in at zero cost.
  give(goods, why, unitCost) {
    const got = {}, inv = this.S.inv, v = this.nearVehicle();
    for (const k of GOOD_IDS) {
      let n = goods[k] | 0; if (n <= 0) continue;
      const sz = GOODS[k].size, uc = unitCost && unitCost[k] > 0 ? unitCost[k] : 0;
      const a = Math.min(n, Math.floor(this.pocketFree() / sz)); if (a > 0) { Inv.add(inv, k, a, a * uc); n -= a; got[k] = (got[k] | 0) + a; }
      if (n > 0 && v) { const b = Math.min(n, this.trunkFit(v, k)); if (b > 0) { Inv.add(v.trunk, k, b, b * uc); n -= b; got[k] = (got[k] | 0) + b; } }
      if (n > 0 && why === 'pickup') this.g.ui.toast(`No room for ${fmtQty(k, n)} more ${GOODS[k].name}.`, 'warn');
    }
    return units(got) ? got : null;
  }
  // everything the player can sell from right now (pockets + nearby trunk), with its cost basis
  carried() { const o = Inv.clone(this.S.inv); const v = this.nearVehicle(); if (v) for (const k of GOOD_IDS) { const n = Inv.has(v.trunk, k); if (n) { o[k] = (o[k] | 0) + n; if (Inv.cost(v.trunk, k)) { o.$cb = o.$cb || {}; o.$cb[k] = (o.$cb[k] || 0) + Inv.cost(v.trunk, k); } } } return o; }
  // take n lots (pockets first, then the nearby trunk). Returns false if not all were there;
  // the cost basis that left is recorded in this.lastCost for realised profit.
  take(good, n) {
    const inv = this.S.inv, v = this.nearVehicle();
    let c = 0;
    const a = Math.min(n, Inv.has(inv, good)); if (a) { c += Inv.remove(inv, good, a); n -= a; }
    if (n > 0 && v) { const b = Math.min(n, Inv.has(v.trunk, good)); if (b) { c += Inv.remove(v.trunk, good, b); n -= b; } }
    this.lastCost = c;
    return n === 0;
  }
  // what of a stored car's cargo would not fit in its property's stash and your pockets ('' when it all fits).
  // The garage sale refuses while anything would be left over, so a sale never throws product away.
  unloadLeftover(e) {
    const src = e.trunk, left = {};
    const pid = e.at && PROP_BY_ID[e.at.p] && this.props.owned(e.at.p) && this.props.storageCap(e.at.p) ? e.at.p : null;
    let room = pid ? Math.max(0, this.props.storageFree(pid)) : 0, pocket = Math.max(0, this.pocketFree());
    for (const k of GOOD_IDS) {
      const sz = GOODS[k].size; let n = Inv.has(src, k);
      const a = Math.min(n, Math.floor(room / sz)); n -= a; room -= a * sz;
      const b = Math.min(n, Math.floor(pocket / sz)); n -= b; pocket -= b * sz;
      if (n > 0) left[k] = n;
    }
    return units(left) ? goodsList(left) : '';
  }
  // a car being sold out of a garage: its cargo goes into that property's stash, then your pockets
  unloadTrunk(e) {
    const S = this.S, src = e.trunk, before = goodsList(src);
    const pid = e.at && PROP_BY_ID[e.at.p] && this.props.owned(e.at.p) && this.props.storageCap(e.at.p) ? e.at.p : null;
    for (const k of GOOD_IDS) {
      if (pid) Inv.move(src, S.storage[pid] || (S.storage[pid] = {}), k, Inv.has(src, k), this.props.storageFree(pid));
      Inv.move(src, S.inv, k, Inv.has(src, k), this.pocketFree());
    }
    const left = units(src) ? goodsList(src) : '';
    Inv.clear(src);
    return `Cargo unloaded (${before})${pid ? ' into ' + PROP_BY_ID[pid].name : ' into your pockets'}${left ? '. No room for ' + left + ': it went with the car' : ''}.`;
  }
  // record a sale: proceeds against the cost basis that just left (feeds the realised P/L stat)
  realize(proceeds, k) {
    const S = this.S, d = proceeds - (this.lastCost || 0);
    S.st.realized = (S.st.realized || 0) + d;
    if (k && GOODS[k]) { const rb = S.realBy || (S.realBy = {}); rb[k] = Math.round((rb[k] || 0) + d); }
    this.lastCost = 0;
  }
  carryHeat() { let h = 0; const o = this.carried(); for (const k of GOOD_IDS) if (o[k] > 0) h += o[k] * GOODS[k].heat; return h; }
  // ---------------------------------------------------------------- earning from zero
  rollChopList() { const pool = ['suv', 'sports', 'pickup', 'van', 'muscle', 'luxury', 'sedan', 'coupe', 'classic', 'gangcar', 'offroad', 'crest', 'apex', 'hellion', 'kodiak', 'estate']; this.S.chopWanted = pickN(pool, 3); }
  chopValue(v) {
    const base = (CHOP_VALUE[v.type] || 300) * (TIER_LOOK[v.vtier] || TIER_LOOK.common).value;
    const cond = clamp(v.health / 100, 0.15, 1);
    const want = this.S.chopWanted.includes(v.type) ? 1.6 : 1;
    return Math.round(base * (0.35 + cond * 0.65) * want / 10) * 10;
  }
  sellCar(v, withCargo) {
    const g = this.g, S = this.S;
    if (g.police.level > 0) { g.content.deny('The chop shop rolls the door down. “Not with cops on you.”'); return; }
    if (v.garageUid || v.owned) { g.content.deny('That one’s registered to you. Sell it from your garage.'); return; }
    if (isUniqueType(v.type)) { g.content.deny('Knuckles: “A one-off? Nobody strips that. Get it out of my yard.”'); return; }
    if (v.type === 'police' || v.type === 'unmarked') { g.content.deny('“A cop car? Get that out of here.”'); return; }
    if (!withCargo && units(v.trunk)) { g.ui.ask('Sell it with the cargo?', `The trunk still holds ${goodsList(v.trunk)} (${fmtLb(cargoC(v.trunk))}). The chop shop keeps whatever is in it.`, 'Sell with cargo', () => this.sellCar(v, true)); return; }
    const pay = this.chopValue(v), wanted = S.chopWanted.includes(v.type);
    const lost = units(v.trunk);
    Money.emptyCar(0, v); // cash left in a stolen car comes out with you; the cargo stays with the car
    g.exitVehicle(true); if (g.vreg) g.vreg.forget(v, 'sold'); g.vehicles.despawn(v);
    g.earn(pay, 'chop'); S.st.chopped++; this.addRep(wanted ? 25 : 10, null);
    if (wanted) S.chopWanted = S.chopWanted.filter(t => t !== v.type);
    g.ui.toast(`Chop shop paid ${fmtMoney(pay)} for the ${v.spec.name}${wanted ? ' (on the wanted list)' : ''}.${lost ? ' Whatever was in the trunk is theirs now.' : ''}`, 'money');
    g.audio.play('cash');
    g.autosave('Car sold');
  }
  // first time the player gets into somebody else's parked car: check the glovebox
  lootCar(v) {
    if (v.looted || v.owned || v.garageUid || v.mission) return;
    v.looted = true;
    const r = Math.random(), g = this.g, z = zoneKey(v.pos.x, v.pos.z), w = ZONE_WEALTH[z] || 1;
    if (r < 0.32) { const c = Math.round(rand(15, 110) * w); g.earn(c, 'glovebox'); g.ui.toast(`Found ${fmtMoney(c)} in the glovebox.`, 'money'); }
    else if (r < 0.5) { const t = this.give({ hot: randi(1, 3) }); if (t) g.ui.toast(`Glovebox: ${goodsList(t)}. A fence will take it.`, 'money'); }
    else if (r < 0.54 && !g.save.weapons.pistol) { g.save.weapons.pistol = true; g.save.ammo.pistol += 12; g.ui.toast('There’s a pistol under the seat. Twelve rounds.', 'money'); }
    else if (r < 0.6) { const k = pick(['green', 'smokes', 'pills']); const t = this.give({ [k]: randi(1, 4) }); if (t) g.ui.toast(`Someone left ${goodsList(t)} under the seat.`, 'money'); }
  }
  pickpocketTarget() {
    const g = this.g, p = g.player;
    if (p.state !== 'foot' || p.interior) return null;
    let best = null, bd = 1.6 * 1.6;
    for (const q of g.peds.peds) {
      if (q.kind !== 'civ' || q.picked || !(q.state === 'walk' || q.state === 'idle' || q.state === 'wait' || q.state === 'sit' || q.state === 'cross')) continue;
      const d = dist2(q.x, q.z, p.pos.x, p.pos.z); if (d > bd) continue;
      // must be behind them: the player is outside their forward 110° view
      const dx = p.pos.x - q.x, dz = p.pos.z - q.z, l = Math.sqrt(d) || 1;
      if ((dx * Math.sin(q.h) + dz * Math.cos(q.h)) / l > -0.15) continue;
      bd = d; best = q;
    }
    return best;
  }
  pickpocket(q) {
    const g = this.g, S = this.S, z = zoneKey(q.x, q.z);
    q.picked = true;
    const chance = 0.7 + g.env.night * 0.1 + Math.min(0.12, this._rank * 0.02) - (q.state === 'sit' ? 0.15 : 0);
    g.player.punchT = g.player.punchDur = 0.3; g.player.pose.punchArm = 1;
    if (Math.random() < chance) {
      const L = pocketLoot(q, z), cash = L.cash;
      g.earn(cash, 'pickpocket'); S.st.picks++;
      let extra = '';
      if (L.hot) { const t = this.give({ hot: L.hot }); if (t) extra = ` and ${L.item}${L.hot > 1 ? ` (+${L.hot - 1} more)` : ''}`; }
      if (L.jackpot) { g.ui.banner(L.type === 'courier' ? 'Payroll envelope' : 'Big score', fmtMoney(cash), 'pass', 2.6); g.audio.play('win2'); }
      g.ui.toast(`Lifted ${fmtMoney(cash)}${extra} from ${L.label}.`, 'money');
      S.st.bestPick = Math.max(S.st.bestPick || 0, cash);
      if (S.st.picks % 5 === 0 || cash >= 5000) this.addRep(cash >= 5000 ? 15 : 5, null);
    } else {
      g.ui.toast('They felt it! Get out of here.', 'warn');
      g.audio.play('scream', { x: q.x, z: q.z, gain: 0.7 });
      q.state = 'flee'; q.timer = rand(5, 8); q.fleeFrom = { x: g.player.pos.x, z: g.player.pos.z };
      g.police.crime('pickpocket', q.x, q.z);
    }
  }
  // the engine reports every knockdown; robbing gang members and their drops live here
  onKnock(p, byPlayer, ko) {
    if (!byPlayer) return;
    // knocking a civilian down is assault, not a way to earn: nothing drops (mugging is cut, §20, §45.18).
    // Pickpocketing is the civilian-theft verb. Criminals still drop their Dirty Cash and product.
    if (p.kind === 'gang' && !p.dropped && (ko || Math.random() < 0.6)) {
      p.dropped = true;
      // whatever they carried spills out on the far side of them, away from the attacker
      const pl = this.g.player.pos, ax = p.x - pl.x, az = p.z - pl.z, al = Math.hypot(ax, az) || 1;
      const dx = p.x + ax / al * 0.9, dz = p.z + az / al * 0.9;
      const F = FACTIONS[p.fac];
      const goods = Math.random() < 0.6 && F ? { [pick(F.goods)]: randi(1, p.role === 'dealer' ? 6 : 3) } : null;
      this.pickups.drop(dx, dz, (p.role === 'boss' ? rand(1500, 4000) : rand(40, 190)) * (p.role === 'dealer' ? 1.6 : 1), goods);
    }
  }
  onPedHit(c, kind, dmg) { this.gangs.onHit(c, kind, dmg); }
  onCrime(type, sev, witnessed, x, z) { this.cops.crime(type, sev, witnessed, x, z); }
  // ---------------------------------------------------------------- strategic clock
  update(dt, rdt) {
    const g = this.g, S = this.S;
    if (g.state === 'menu' || g.state === 'loading') return;
    this.statT -= rdt;
    if (this.statT <= 0) { this.statT = 1; this.recompute(); this.computeInfluence(); if (g.state === 'playing' && !S.jail) this.streetFame(); }
    this.neon.update(g.env.night, g.time, !!(g.player.interior && !(g.player.interior.def && g.player.interior.def.realView)));
    // threat clocks run on real active play, in jail too (§45.16)
    this.threats.update();
    this.rivalwh.update();
    if (S.jail) { this.prison.update(dt, rdt); }
    else if (g.state === 'playing' && dt > 0) {
      const h = Math.floor(g.env.time) % 24;
      if (S.lastHour < 0) S.lastHour = h;
      if (h !== S.lastHour) {
        const steps = (h - S.lastHour + 24) % 24;
        for (let i = 1; i <= steps; i++) { const hr = (S.lastHour + i) % 24; this.tickHours(1, hr); if (hr === 0) this.tickDay(); }
        S.lastHour = h;
      }
    }
    if (dt > 0) {
      this.pickups.update(dt);
      this.compounds.update(dt);
      this.legal.update(dt);
      if (!S.jail) { this.gangs.update(dt); this.shipments.update(dt); this.crew.update(dt); this.opps.update(dt); this.updateMarkers(rdt); }
      this.combatT = Math.max(0, this.combatT - dt);
    }
    this.ui.update(rdt);
  }
  // how many economic hours one world hour is: the reference day length over the chosen one, so a short day doesn't
  // speed up the economy per hour of play (§45.9); in jail world time is 1:1 (§45.8) and so is the clock
  econRate() { return this.S.jail ? 1 : this.g.save.settings.dayLength / ECON_REF_DAY; }
  tickHours(h, hour) {
    this.S.econH += h * this.econRate();
    this.fixer.tick();
    this.market.tick(h);
    this.runs.tickHours();
    this.factions.tickHours(h, hour);
    this.cops.tickHours(h);
    this.opps.tickHours(h);
    this.crew.tickHours(h);
    this.compounds.tickHours();
    this.shipments.tickHours();
    this.recompute();
  }
  tickDay() {
    const S = this.S, g = this.g;
    S.day++;
    S.ledger = { inc: {}, exp: {} };
    this.props.tickDay();
    this.royalty.tickDay();
    this.crew.tickDay();
    // Lieutenants send Drivers to restock the corners for tomorrow (§5, §8)
    this.whse.automate();
    // the rival warehouses mend and restock (a delivery that arrives), unless a raid is on
    this.rivalwh.tickDay();
    this.factions.tickDay();
    this.cops.tickDay();
    this.legal.tickDay();
    if (g.gamble) g.gamble.tickDay();
    this.opps.tickDay();
    S.infamy *= 0.99;
    // the chop shop wanted list and street buyer quotas refresh daily
    if (S.day % 2 === 0) this.rollChopList();
    S.dealQ = {}; S.slept = false;
    this.market.snapshot();
    this.recompute(); this.computeInfluence();
    const L = S.ledger, inc = Object.values(L.inc).reduce((a, b) => a + b, 0), exp = Object.values(L.exp).reduce((a, b) => a + b, 0);
    S.lastLedger = { day: S.day - 1, inc: { ...L.inc }, exp: { ...L.exp } };
    if ((inc || exp) && !S.jail) g.ui.toast(`Day ${this.calDay - 1} books: +${fmtMoney(inc)} / −${fmtMoney(exp)}`, inc >= exp ? 'money' : 'warn');
  }
  news(from, text) { if (this.g.content) this.g.content.phone(from, text, { silent: !!this.S.jail && !(this.S.jail.phone || (this.prison && this.prison.callT > 0)) }); }
  // ---------------------------------------------------------------- stability (saving rules)
  // a powerful player is recognised: people stop and stare, some say something
  streetFame() {
    const g = this.g, p = g.player;
    if (this._rank < 4 || p.interior) return;
    const pv = p.state === 'vehicle' ? p.vehicle : null;
    const flashy = (pv && (pv.type === 'luxury' || pv.type === 'supercar' || pv.type === 'coupe')) || this.crew.bodyguards().length > 0 || this._rank >= 5;
    if (!flashy) return;
    this.fameT -= 1;
    for (const q of g.peds.peds) {
      if (q.kind !== 'civ' || !(q.state === 'walk' || q.state === 'idle') || dist2(q.x, q.z, p.pos.x, p.pos.z) > 8 * 8 || q.stared) continue;
      if (Math.random() < 0.35) { q.stared = true; q.state = 'idle'; q.timer = rand(1.5, 3); q.h = Math.atan2(p.pos.x - q.x, p.pos.z - q.z); q.pose.phone = false; }
    }
    if (this.fameT <= 0 && Math.random() < 0.3) { this.fameT = rand(25, 50); g.content.say('Passer-by', pick(['Is that who I think it is?', 'Don’t stare. Seriously, don’t.', 'That’s the one who runs this block.', 'Keep walking, keep walking.']), 2.6); }
  }
  isStable() {
    const g = this.g, p = g.player;
    if (g.state !== 'playing' || g.fading) return false;
    if (g.police.level > 0 || this.combatT > 0) return false;
    if (g.missions.active || (g.race && g.race.active)) return false;
    if (p.state !== 'foot' && p.state !== 'vehicle') return false;
    if (this.gangs.threatNear(30)) return false;
    return true;
  }
  // ---------------------------------------------------------------- world markers and interaction
  updateMarkers(rdt) {
    this.locT -= rdt; if (this.locT > 0) return; this.locT = 0.3;
    const g = this.g, p = g.player, mm = g.missions.markers;
    for (const it of this.markers) {
      const L = it.L, d2 = dist2(L.x, L.z, p.pos.x, p.pos.z);
      const want = !p.interior && d2 < 95 * 95 && this.locVisible(L);
      if (want && !it.m) { it.m = mm.get(this.locColor(L), L.kind === 'hq' ? 1.3 : 1.0, d2 > 25 * 25); it.m.g.position.set(L.x, groundY(L.x, L.z), L.z); }
      else if (!want && it.m) { mm.release(it.m); it.m = null; }
      if (it.m) it.m.beam.visible = d2 > 20 * 20;
    }
  }
  locVisible(L) {
    if (L.kind === 'hq') return !this.S.factions[L.id].broken;
    if (L.kind === 'prop') return !(L.def.interior);
    return true;
  }
  locColor(L) {
    if (L.kind === 'prop') { const o = this.S.props[L.id]; return o && o.owned ? 0x8fe39b : 0xe8eef6; }
    return L.col;
  }
  // contextual action for the prompt (checked before vehicles and template services)
  findAction() {
    const g = this.g, p = g.player, S = this.S;
    if (g.state !== 'playing') return null;
    if (p.interior && !p.interior.vspace) return S.jail ? this.prison.findAction() : this.props.interiorAction();
    const ra = this.rivalwh.findAction(); if (ra) return ra;
    const sa = this.shipments.findAction(); if (sa) return sa;
    const ia = g.impound.findAction(); if (ia) return ia;
    const ma = g.motorsport.findAction(); if (ma) return ma;
    const oa = g.offroad.findAction(); if (oa) return oa;
    if (p.state === 'vehicle') {
      const v = p.vehicle;
      const wa = g.wash.findAction(); if (wa) return wa;
      if (v.speed < 3) {
        const ch = this.loc('spot', 'chop');
        // the chop shop works on any car that isn't legally yours: a stolen one, or a HOT one in your fleet (§45.30)
        if (ch && dist2(v.pos.x, v.pos.z, ch.x, ch.z) < 9 * 9 && g.chop.car(v)) return { label: `Chop shop · ${v.spec.name}${g.vreg.isHot(v) ? ' (HOT)' : ''}`, act: () => g.chop.open(v) };
        const lb = this.compounds.bayAction(v); if (lb) return lb;
        const ga = this.props.garageActionVehicle(v); if (ga) return ga;
      }
      return null;
    }
    if (p.state !== 'foot') return null;
    for (const L of this.locs) {
      if (L.kind === 'deal') continue;
      if (dist2(L.x, L.z, p.pos.x, p.pos.z) > 2.4 * 2.4) continue;
      if (L.kind === 'prop') { const a = this.props.doorAction(L); if (a) return a; }
      if (L.kind === 'spot') return { label: L.def.chop ? 'Chop shop (drive a stolen car in)' : `${L.def.name} · ${L.def.role}`, act: () => L.def.chop ? this.ui.openChopInfo() : this.ui.openSpot(L) };
    }
    const ga = this.props.garageActionFoot(); if (ga) return ga;
    const t = this.gangs.talkTarget(); if (t) return t;
    const buyer = this.gangs.buyerNear(); if (buyer) return { label: 'Deal to the street buyers', act: () => this.ui.openDeal(buyer) };
    const q = this.pickpocketTarget(); if (q) return { label: 'Pickpocket', act: () => this.pickpocket(q) };
    return null;
  }
}

