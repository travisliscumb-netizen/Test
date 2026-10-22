/* =====================================================================
   [CORE] SAVE SYSTEM
   ===================================================================== */
const SAVE_KEY = 'pvunderworld.save.v1';
const SETTINGS_KEY = 'pvunderworld.settings.v1';
// v4: worn vest, where each owned gun is (carried or a property stash), gambling statistics.
// Older saves load unchanged: every gun counts as carried, no vest, empty stats.
// v5: prison runs its own sentence clock (the street moves a day per week served); the days a v4 jail
// stay added to the street calendar are taken back out of the calendar shown (uw.dayOffset). Taxi rides,
// tutorial progress and burglary records are new fields with safe defaults.
// v6: no casino table limits (tables are seats, not tiers), Royale Billions jackpot pressure (gamble.jp) and
// bet preferences (gamble.pref); jail good-behaviour points and contraband phone state; 45 homes and 50
// businesses with business levels; dealership lots. Every new field defaults safely, so v5 saves load as they are.
// v8 (overhaul Session 1): the single `money` number is gone. Money lives in `wallet` (Dirty Cash by place, Clean
// Bank, medical debt; see Money). A development save's old balance moves into Clean Bank (§45.2) before the merge,
// because merge() would silently drop a field whose type changed. Production starts a fresh save generation.
// v8 -> v9 (Session 2): turf ownership is saved state (save.uw.turfs[i].own, set once from influence by
// Underworld.sanitize); the Rank peak is uw.rankMax; the removed personal upgrades (Handling, Low Profile, Body
// Armor, §18 / §45.12) and the dead engine/brakes/durability fields go, and what was paid for the removed levels
// is refunded to Clean Bank.
const SAVE_VERSION = 9;
const REMOVED_UPGRADE_PRICES = { handling: [1200, 2600, 5200], cooldown: [1500, 3200, 6400], armor: [2000, 4000, 8000] };
const SaveSystem = {
  defaults() {
    return {
      version: SAVE_VERSION,
      wallet: Money.fresh(),
      upgrades: { stamina: 0, health: 0 },
      weapons: { bat: false, pistol: false, smg: false, shotgun: false },
      ammo: { pistol: 0, smg: 0, shotgun: 0 },
      wloc: { bat: null, pistol: null, smg: null, shotgun: null },
      vest: 0,
      gamble: {
        scratch: { bought: 0, spent: 0, won: 0, biggest: 0, wins: 0 },
        slots: { spins: 0, wagered: 0, won: 0, biggest: 0, jackpots: 0 },
        casino: { wagered: 0, won: 0, lost: 0, biggest: 0, biggestSlot: 0, bjHands: 0, bjWins: 0, pokerHands: 0, pokerWins: 0, rouletteSpins: 0, slotSpins: 0, chips: 0 },
        // Royale Billions: per-jackpot drought pressure and hit counts (saved so a reload never resets the pressure)
        jp: { spins: 0, wagered: 0, won: 0, biggest: 0, pr: {}, hits: {}, last: null },
        pref: {}
      },
      vehicles: {},
      garage: [],
      // the vehicle registry (Session 5A): stolen cars kept track of, cars waiting for a space, what happened to cars
      tracked: [], nextTrack: 0, pendingCars: [], vlog: [],
      // the police impound lot's own state (Session 5B): breaches in its fence and gate
      impoundLot: { breach: {} },
      dealers: {},
      nextUid: 1,
      pos: null,
      missionsCompleted: 0,
      timeOfDay: 18.3,
      rep: 0,
      home: null,
      owns: { penthouse: false },
      story: {},
      flags: {},
      discovered: { zones: {}, places: {} },
      packages: {},
      hints: {},
      secrets: {},
      achievements: {},
      jumps: {},
      races: {},
      outfit: { shirt: 0x26323f, pants: 0x2b3448, shoes: 0x151515, cap: -1, hair: 0x1a1410 },
      messages: [], tips: {},
      settings: {
        quality: 'auto', post: true, shadows: true, fov: 70, showFps: false,
        sens: 1, invertY: false, volume: 0.8, music: 0.55, sfx: 0.9, dayLength: 30, weather: true,
        guide: true, traffic: 1, peds: 1, aimAssist: 2
      },
      stats: {
        playTime: 0, distFoot: 0, distDrive: 0, topSpeed: 0, stolen: 0, missionsPassed: 0, missionsFailed: 0,
        maxWanted: 0, busted: 0, wasted: 0, earned: 0, pedsHit: 0, copsWrecked: 0, shots: 0, crashes: 0,
        storyDone: 0, sideDone: 0, racesEntered: 0, racesWon: 0, stuntJumps: 0, bestJump: 0, bestAir: 0, nearMisses: 0,
        bestDrift: 0, eventsDone: 0, escapes: 0, fastTravels: 0, repairs: 0, carsBought: 0, spent: 0, packagesFound: 0
      },
      best: {}
    };
  },
  load() {
    let data = null;
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (raw) data = JSON.parse(raw);
    } catch { data = null; }
    const d = this.defaults();
    const st = this.loadSettings();
    if (!data || typeof data !== 'object') { if (st) { this.mergeInto(d.settings, st); this.sanitize(d); } return { data: d, existed: false }; }
    const oldVersion = typeof data.version === 'number' ? data.version : 1;
    // v7 -> v8: the old single balance becomes Clean Bank (§45.2). Read raw, before merge() could drop it.
    if (oldVersion < 8 && !(data.wallet && typeof data.wallet === 'object')) data.wallet = { clean: typeof data.money === 'number' && isFinite(data.money) && data.money > 0 ? data.money : 0 };
    delete data.money;
    if (oldVersion < 9 && data.upgrades && typeof data.upgrades === 'object') {
      let refund = 0;
      for (const k in REMOVED_UPGRADE_PRICES) { const lv = clamp(Math.floor(+data.upgrades[k] || 0), 0, 3); for (let n = 0; n < lv; n++) refund += REMOVED_UPGRADE_PRICES[k][n]; }
      for (const k of ['handling', 'cooldown', 'armor', 'engine', 'brakes', 'durability']) delete data.upgrades[k];
      if (refund > 0) { if (!data.wallet || typeof data.wallet !== 'object') data.wallet = {}; data.wallet.clean = (isFinite(data.wallet.clean) && data.wallet.clean > 0 ? data.wallet.clean : 0) + refund; }
    }
    // deep-merge so new fields added in later versions get defaults
    const merge = (dst, src) => {
      for (const k in src) {
        if (src[k] && typeof src[k] === 'object' && !Array.isArray(src[k]) && dst[k] && typeof dst[k] === 'object' && !Array.isArray(dst[k])) merge(dst[k], src[k]);
        else if (src[k] !== undefined && src[k] !== null && (typeof src[k] === typeof dst[k] || dst[k] === undefined) && Array.isArray(src[k]) === Array.isArray(dst[k])) dst[k] = src[k];
      }
    };
    merge(d, data);
    if (data.wloc && typeof data.wloc === 'object' && !Array.isArray(data.wloc)) d.wloc = { ...data.wloc }; // null defaults would block string values in merge()
    if (data.wallet && typeof data.wallet.treasury === 'string') d.wallet.treasury = data.wallet.treasury; // same: the Treasury Warehouse id (validated by Money.sanitize)
    if (st) this.mergeInto(d.settings, st);
    this.sanitize(d);
    // v3 -> v4: nothing to convert (new fields default sensibly); remember that it happened
    // v4 -> v5: every day served used to be a whole street day. The calendar shown keeps only a day per
    // week served (internal day numbers stay as they are, so no timer or truce shifts)
    if (oldVersion < 5 && d.uw && typeof d.uw === 'object' && d.uw.st && d.uw.st.jailDays > 0) {
      const jd = Math.floor(+d.uw.st.jailDays || 0), infl = jd - Math.round(jd / 7);
      d.uw.dayOffset = clamp((+d.uw.dayOffset || 0) + infl, 0, Math.max(0, (+d.uw.day || 1) - 1));
    }
    // (v4 kept a 1×/5×/20× jail speed; Prison.sanitize turns anything but an unlocked 1×/2×/3× back into 1×)
    // v6 -> v7: trunks are weighed in pounds now, but their contents stay as they were (whole lots, cost basis
    // intact): every v6 load weighs far less than its car's new capacity, so nothing is moved or dropped. Faction
    // aggression (aggro, trouble) is new and starts calm; Royale pressure keeps its meaning (owed hits per tier).
    if (oldVersion < 7 && d.gamble && d.gamble.jp) d.gamble.jp.pr = {};
    const migrated = oldVersion < SAVE_VERSION;
    if (migrated) { d.flags.migratedFrom = oldVersion; }
    return { data: d, existed: true, migrated };
  },
  mergeInto(dst, src) { if (!src || typeof src !== 'object') return; for (const k in dst) if (src[k] !== undefined && typeof src[k] === typeof dst[k]) dst[k] = src[k]; },
  loadSettings() { try { const r = localStorage.getItem(SETTINGS_KEY); const o = r ? JSON.parse(r) : null; return o && typeof o === 'object' ? o : null; } catch { return null; } },
  saveSettings(s) { try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(s)); return true; } catch { return false; } },
  sanitize(d) {
    d.wallet = Money.sanitize(d.wallet);
    delete d.money;
    if (!Array.isArray(d.garage)) d.garage = [];
    d.garage = d.garage.filter(e => e && typeof e === 'object' && VEHICLES[e.type]);
    // v6 dealership stock: anything malformed is dropped (that stall restocks); a broken lot starts over
    if (!d.dealers || typeof d.dealers !== 'object' || Array.isArray(d.dealers)) d.dealers = {};
    for (const k of Object.keys(d.dealers)) {
      const L = d.dealers[k];
      if (!DEALERSHIPS[k] || !L || typeof L !== 'object' || !Array.isArray(L.cars) || L.cars.length > 40) { delete d.dealers[k]; continue; }
      L.d = Number.isFinite(L.d) ? Math.floor(L.d) : -999; L.n = Number.isFinite(L.n) ? Math.floor(L.n) % 1e9 : 0;
      L.cars = L.cars.map(c => c && typeof c === 'object' && VEHICLES[c.type] && Number.isFinite(c.price) && c.price > 0 && c.price < 1e9 ? {
        type: c.type, color: Number.isFinite(c.color) ? c.color : VEHICLES[c.type].colors[0], cond: clamp(Math.round(Number(c.cond) || 100), 30, 100), km: Math.max(0, Math.round(Number(c.km) || 0)),
        price: Math.round(c.price), vtier: TIER_LOOK[c.vtier] ? c.vtier : VEHICLES[c.type].tier, bargain: !!c.bargain } : null);
    }
    let maxUid = 0;
    for (const e of d.garage) {
      if (typeof e.uid !== 'number') e.uid = ++maxUid + 1000;
      maxUid = Math.max(maxUid, e.uid);
      if (typeof e.color !== 'number') e.color = VEHICLES[e.type].colors[0];
      if (!e.origin) e.origin = 'bought';
      // provenance (§45.24): what was put into a bought car, by currency. A car bought before it was recorded is
      // treated as Dirty-origin at its old resale base (development saves only): "not stolen" is not "clean"
      if (e.origin === 'bought') {
        const p = e.prov && typeof e.prov === 'object' ? e.prov : null, ok = v => Number.isFinite(v) && v >= 0 && v < 1e9;
        e.prov = p && ok(p.dirty) && ok(p.clean) && p.dirty + p.clean > 0 ? { dirty: p.dirty, clean: p.clean } : { dirty: Math.round(carMsrp(e.type) * 0.5), clean: 0 };
      } else delete e.prov;
      e.dmg = clamp(+e.dmg || 0, 0, 100);
      e.tune = Object.assign({ engine: 0, brakes: 0, grip: 0, armor: 0 }, e.tune || {});
      for (const k in e.tune) e.tune[k] = clamp(e.tune[k] | 0, 0, 3);
      e.trunk = Inv.clean(e.trunk, (v, def, lo, hi) => (typeof v === 'number' && isFinite(v)) ? clamp(v, lo, hi) : def);
      e.at = e.at && typeof e.at === 'object' && typeof e.at.p === 'string' && Number.isInteger(e.at.i) && e.at.i >= 0 ? { p: e.at.p, i: e.at.i } : null;
    }
    // where each car is (its home bay e.at, or e.loc on the street), the tracked stolen cars, cars waiting for space
    VehicleRegistry.sanitize(d);
    for (const k of ['pistol', 'smg', 'shotgun', 'bat']) d.weapons[k] = !!d.weapons[k];
    // where each gun is: null = on you; a property id = in that property's stash
    if (!d.wloc || typeof d.wloc !== 'object') d.wloc = {};
    // (property ids are checked again once the world, and its home ladder, exists: Underworld.bind)
    for (const k of ['pistol', 'smg', 'shotgun', 'bat']) { const w = d.wloc[k]; d.wloc[k] = d.weapons[k] && typeof w === 'string' && w.length < 40 ? w : null; }
    for (const k in d.wloc) if (!['pistol', 'smg', 'shotgun', 'bat'].includes(k)) delete d.wloc[k];
    d.vest = typeof d.vest === 'number' && isFinite(d.vest) ? clamp(d.vest, 0, VEST_MAX) : 0;
    const gd = this.defaults().gamble;
    if (!d.gamble || typeof d.gamble !== 'object') d.gamble = gd;
    for (const grp of ['scratch', 'slots', 'casino']) { if (!d.gamble[grp] || typeof d.gamble[grp] !== 'object') d.gamble[grp] = { ...gd[grp] }; for (const k in gd[grp]) { const v = d.gamble[grp][k]; d.gamble[grp][k] = typeof v === 'number' && isFinite(v) && v >= 0 ? v : 0; } }
    { // jackpot pressure: finite, non-negative, known tiers only; preferences: positive finite amounts only
      const J = d.gamble.jp && typeof d.gamble.jp === 'object' && !Array.isArray(d.gamble.jp) ? d.gamble.jp : {}, okN = v => typeof v === 'number' && isFinite(v) && v >= 0;
      const pr = {}, hits = {}; for (const m of ROYALE_MAJORS) { if (J.pr && okN(J.pr[m.id])) pr[m.id] = Math.min(J.pr[m.id], 50); if (J.hits && okN(J.hits[m.id])) hits[m.id] = Math.floor(J.hits[m.id]); }
      d.gamble.jp = { spins: okN(J.spins) ? Math.floor(J.spins) : 0, wagered: okN(J.wagered) ? J.wagered : 0, won: okN(J.won) ? J.won : 0, biggest: okN(J.biggest) ? J.biggest : 0, pr, hits, last: J.last && typeof J.last === 'object' && typeof J.last.id === 'string' ? { id: J.last.id, day: J.last.day | 0 } : null };
      const P = d.gamble.pref && typeof d.gamble.pref === 'object' && !Array.isArray(d.gamble.pref) ? d.gamble.pref : {}; d.gamble.pref = {};
      for (const k of ['bj', 'roul', 'royale', 'pokerBuy', 'pokerDepth']) if (typeof P[k] === 'number' && isFinite(P[k]) && P[k] > 0 && P[k] < 1e15) d.gamble.pref[k] = Math.floor(P[k]);
    }
    // progressive pools and an unfinished blackjack hand (stood on load; a malformed one is refunded)
    const pools = d.gamble.casino.pools; d.gamble.casino.pools = {};
    for (const id in SLOT_DEFS) { const pr = SLOT_DEFS[id].progressive; if (pr) d.gamble.casino.pools[id] = pools && typeof pools === 'object' && isFinite(pools[id]) ? clamp(pools[id], pr.seed, 5e7) : pr.seed; }
    const T = d.gamble.table, okCard = c => c && typeof c === 'object' && Number.isInteger(c.r) && c.r >= 2 && c.r <= 14 && Number.isInteger(c.s) && c.s >= 0 && c.s <= 3;
    if (T && typeof T === 'object') {
      // (v5 hands carried a limit tier instead of a seat; both load, there is no table maximum to check now)
      const hands = Array.isArray(T.hands) ? T.hands : [];
      const ok = T.game === 'bj' && hands.length >= 1 && hands.length <= 2 && hands.every(h => h && Array.isArray(h.cards) && h.cards.length >= 1 && h.cards.length <= 12 && h.cards.every(okCard) && isFinite(h.bet) && h.bet > 0 && h.bet < 1e15) && Array.isArray(T.dealer) && T.dealer.length === 2 && T.dealer.every(okCard);
      if (!ok) { let back = 0; for (const h of hands) if (h && isFinite(h.bet) && h.bet > 0) back += Math.min(h.bet, 1e15); d.wallet.clean += Math.min(back, MONEY_MAX); d.gamble.table = null; }
      else T.seat = Number.isInteger(T.seat) && T.seat >= 0 && T.seat < 8 ? T.seat : 0;
    } else d.gamble.table = null;
    for (const e of d.garage) e.vtier = typeof e.vtier === 'string' && TIER_LOOK[e.vtier] ? e.vtier : VEHICLES[e.type].tier;
    if (!d.pos || typeof d.pos !== 'object' || !isFinite(d.pos.x) || !isFinite(d.pos.z) || !isFinite(d.pos.h)) d.pos = null;
    else { d.pos.x = clamp(d.pos.x, -10, CITY + 10); d.pos.z = clamp(d.pos.z, -10, CITY + 10); }
    if (typeof d.rep !== 'number' || !isFinite(d.rep) || d.rep < 0) d.rep = 0;
    if (!(d.nextUid > maxUid)) d.nextUid = maxUid + 1;
    if (!d.tips || typeof d.tips !== 'object' || Array.isArray(d.tips)) d.tips = {};
    for (const k in d.tips) if (!TUTORIAL.some(L => L.id === k)) delete d.tips[k]; else d.tips[k] = 1;
    if (!Array.isArray(d.messages)) d.messages = [];
    d.messages = d.messages.filter(m => m && typeof m.text === 'string').slice(-60);
    if (typeof d.rep !== 'number' || !isFinite(d.rep)) d.rep = 0;
    // numbers that went bad (NaN/Infinity from an old bug or a hand-edited save) fall back to defaults
    const def = this.defaults();
    for (const grp of ['stats', 'settings', 'upgrades', 'ammo']) for (const k in def[grp]) if (typeof def[grp][k] === 'number' && !(typeof d[grp][k] === 'number' && isFinite(d[grp][k]))) d[grp][k] = def[grp][k];
    const S = d.settings;
    S.fov = clamp(S.fov, 55, 90); S.sens = clamp(S.sens, 0.2, 3); S.volume = clamp(S.volume, 0, 1); S.music = clamp(S.music, 0, 1); S.sfx = clamp(S.sfx, 0, 1);
    S.dayLength = clamp(S.dayLength, 4, 60); S.traffic = clamp(S.traffic, 0.3, 1.5); S.peds = clamp(S.peds, 0.3, 1.5); S.aimAssist = clamp(Math.round(S.aimAssist), 0, 3);
    if (S.quality !== 'auto' && !(S.quality >= 0 && S.quality <= 3)) S.quality = 'auto';
    if (!isFinite(d.timeOfDay)) d.timeOfDay = 9.5; d.timeOfDay = ((d.timeOfDay % 24) + 24) % 24;
    for (const k in d.upgrades) d.upgrades[k] = clamp(d.upgrades[k] | 0, 0, 3);
    if (d.home !== null && typeof d.home !== 'string') d.home = null;
    d.version = SAVE_VERSION;
  },
  // saves hold plain data only: anything that is a class instance (a live vehicle, a mesh, a
  // vector) is dropped instead of breaking the whole save with a circular-structure error
  _plain(k, v) { if (v && typeof v === 'object' && !Array.isArray(v)) { const pr = Object.getPrototypeOf(v); if (pr !== Object.prototype && pr !== null) return undefined; } return v; },
  save(data) {
    this.lastError = null;
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(data, this._plain)); this.saveSettings(data.settings); return true; }
    catch (e) { this.lastError = (e && e.name) || 'error'; console.warn('Save failed: ' + ((e && e.message) || e)); return false; }
  },
  wipe() { try { localStorage.removeItem(SAVE_KEY); } catch { /* storage blocked */ } }
};
/* Money feedback: every change to the money you hold (cash on you, the bank) pops a green "+$n" or red "-$n"
   under the readout. It listens to Money, the one place money changes, so no system needs its own call. Changes
   within a short burst, in the same currency and direction, merge into one line. */
const MoneyFeed = {
  live: false, sink: null, last: null,
  init() { Money.on(e => { if (this.live && (e.cur === 'dirty' || e.cur === 'clean') && Math.abs(e.d) >= 0.5) this.push(e.d, e.cur); }); },
  push(delta, cur = 'dirty') {
    const now = performance.now(), L = this.last;
    if (L && L.el && L.el.isConnected && L.cur === cur && Math.sign(L.d) === Math.sign(delta) && now - L.t < 150) { L.d += delta; L.t = now; if (this.sink) this.sink(L, true); return; }
    this.last = { d: delta, cur, t: now, el: null };
    if (this.sink) this.sink(this.last, false);
  }
};
