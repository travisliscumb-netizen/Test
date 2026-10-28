/* =====================================================================
   [UNDERWORLD] EMPIRE UI: the phone (overview, territory map, crew, assets,
   market, stash, factions, police, feed), every street menu (property,
   supplier, armorer, fence, deal corner, boss sit-down, chop shop), the
   territory overlay for the big map and the jail HUD. The HUD itself stays
   clean: money, health, wanted level, prompt, weapon, speed.
   ===================================================================== */
// the phone: apps on a home screen, each with one or a few pages (tabs). 'go' apps leave the phone.
const PHONE_APPS = [
  { id: 'empire', name: 'Empire', icon: '👑', col: '#ffb547', cat: 'BUSINESS', sub: 'turf · rivals', tabs: [['overview', 'Overview'], ['map', 'Territory'], ['factions', 'Factions']] },
  { id: 'market', name: 'Market', icon: '📈', col: '#7fe08f', cat: 'BUSINESS', sub: 'cost · profit', tabs: [['pnl', 'My stock'], ['market', 'Prices']] },
  { id: 'connect', name: 'Street Connect', icon: '🤝', col: '#d28cff', cat: 'BUSINESS', sub: 'buy · sell', tabs: [['connect', 'Contacts']] },
  { id: 'inventory', name: 'Inventory', icon: '🎒', col: '#46d4c4', cat: 'BUSINESS', sub: 'carried · stored', tabs: [['stash', 'All product']] },
  { id: 'stashes', name: 'Stashes', icon: '📦', col: '#c9a46b', cat: 'BUSINESS', sub: 'what is where', tabs: [['stashes', 'Stashes']] },
  { id: 'crew', name: 'Crew', icon: '👥', col: '#7fb2ff', cat: 'OPERATIONS', sub: 'people · runs', tabs: [['crew', 'Crew'], ['runs', 'Deliveries']] },
  { id: 'property', name: 'Property', icon: '🏠', col: '#8fe39b', cat: 'OPERATIONS', sub: 'homes · garages', tabs: [['assets', 'Property']] },
  { id: 'business', name: 'Business', icon: '🏢', col: '#ffd84d', cat: 'OPERATIONS', sub: 'income · upgrades', tabs: [['biz', 'Businesses']] },
  { id: 'garage', name: 'Garage', icon: '🚗', col: '#9ec5ff', cat: 'OPERATIONS', sub: 'your cars', tabs: [['garage', 'Cars']] },
  { id: 'armory', name: 'Armory', icon: '🎯', col: '#ff8a3d', cat: 'OPERATIONS', sub: 'guns · ammo', tabs: [['loadout', 'Weapons']] },
  { id: 'police', name: 'Police', icon: '🚨', col: '#4d8dff', cat: 'CITY', sub: 'heat · payroll', tabs: [['police', 'Police']] },
  { id: 'feed', name: 'Feed', icon: '📰', col: '#e8eef6', cat: 'CITY', sub: 'news · messages', tabs: [['feed', 'Feed']] },
  { id: 'map', name: 'Map', icon: '🗺️', col: '#46d4c4', cat: 'CITY', sub: 'city map', go: 'map' },
  { id: 'taxi', name: 'Cabline', icon: '🚕', col: '#f4c20d', cat: 'CITY', sub: 'call a cab', go: 'taxi' }
];
const APP_OF_TAB = {}; for (const a of PHONE_APPS) for (const [t] of a.tabs || []) APP_OF_TAB[t] = a;
const EMP_TABS = [['overview', 'Overview'], ['map', 'Territory'], ['crew', 'Crew'], ['runs', 'Deliveries'], ['assets', 'Assets'], ['market', 'Market'], ['stash', 'Inventory'], ['loadout', 'Loadout'], ['factions', 'Factions'], ['police', 'Police'], ['feed', 'Feed']];
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
class EmpireUI {
  constructor(uw) {
    this.uw = uw; this.tab = 'home'; this.selTurf = null; this.msg = ''; this.cc = { good: 'all', role: 'both' }; this.pnlSel = null;
    const tabs = $('empTabs');
    tabs.addEventListener('click', e => { const b = e.target.closest('[data-tab]'); if (!b) return; this.uw.g.audio.play('ui'); this.tab = b.dataset.tab; this.msg = ''; this.render(); $('empBody').scrollTop = 0; });
    const body = $('empBody');
    body.addEventListener('click', e => {
      const b = e.target.closest('[data-act]'); if (!b || b.disabled) return;
      this.uw.g.audio.play('ui'); this.act(b.dataset.act, b);
    });
    body.addEventListener('change', e => { const s = e.target.closest('select[data-sel]'); if (s) this.act(s.dataset.sel + ':' + s.value, s); });
    body.addEventListener('input', e => {
      if (e.target.id === 'propSearch' && this.pf) { this.pf.q = e.target.value; const l = $('propList'); if (l) l.innerHTML = this.propListHTML(); }
      if (e.target.id === 'bizSearch' && this.bf) { this.bf.q = e.target.value; const l = $('bizList'); if (l) l.innerHTML = this.bizListHTML(); }
    });
    body.addEventListener('pointerdown', e => {
      const cv = e.target.closest('#empMap'); if (!cv) return;
      const r = cv.getBoundingClientRect(), ui = this.uw.g.ui;
      const mx = (e.clientX - r.left) / r.width * 1024, mz = (e.clientY - r.top) / r.height * 1024;
      const wx = mx / ui.mapK - ui.mapE, wz = mz / ui.mapK - ui.mapE;
      if (wx >= 0 && wz >= 0 && wx < CITY && wz < CITY) { this.selTurf = turfAt(wx, wz); this.render(); }
    });
    $('jailLife').addEventListener('click', () => { if (this.uw.S.jail) this.uw.prison.openLife(); });
    $('jailEmpire').addEventListener('click', () => { if (this.uw.prison.phone()) this.open('home'); });
    $('jailHud').addEventListener('click', e => { const b = e.target.closest('[data-spd]'); if (b && !b.disabled && this.uw.S.jail) this.uw.prison.setSpeed(+b.dataset.spd); });
    $('ovBtn').addEventListener('click', e => { e.stopPropagation(); this.toggleOverlay(); });
    $('turfInfo').addEventListener('click', e => e.stopPropagation());
    this.hudT = 0;
  }
  get g() { return this.uw.g; }
  open(tab) {
    const g = this.g;
    this.tab = tab && (tab === 'home' || APP_OF_TAB[tab]) ? tab : 'home';
    this.msg = '';
    if (g.state !== 'playing' && g.state !== 'paused') return;
    this.render();
    if (g.ui.modal !== 'empireScreen') g.ui.open('empire');
    if (document.pointerLockElement) document.exitPointerLock();
  }
  // in jail without a phone nothing works but the news on the block TV (the payphone or a smuggled phone opens the rest)
  locked(tab = this.tab) { return this.uw.inJail && !this.uw.prison.phone() && !['home', 'feed'].includes(tab); }
  render() {
    const uw = this.uw, S = uw.S, g = this.g;
    uw.computeInfluence();
    const app = this.tab === 'home' ? null : APP_OF_TAB[this.tab], tabs = $('empTabs');
    $('empTitle').textContent = app ? app.name : 'Phone';
    tabs.classList.toggle('hidden', !app);
    tabs.innerHTML = app ? `<button class="etab back" data-tab="home" aria-label="Back to the home screen">‹ Apps</button>${app.tabs.length > 1 ? app.tabs.map(([k, n]) => `<button class="etab${k === this.tab ? ' on' : ''}" data-tab="${k}">${esc(n)}</button>`).join('') : ''}` : '';
    const st = RANKS[uw.rank];
    $('empStats').innerHTML = `<span class="chipS">${esc(st.name)}</span><span>Dirty <b class="money">${fmtMoney(Money.dirtyTotal())}</b></span><span>Bank <b class="money">${fmtMoney(Money.clean)}</b>${Money.debt > 0 ? ` <small>debt ${fmtMoney(Money.debt)}</small>` : ''}</span><span>Rep <b>${g.save.rep}</b></span><span>Influence <b>${uw.influence}</b></span><span>Pressure <b style="color:${S.pressure > 66 ? 'var(--red)' : S.pressure > 33 ? 'var(--amber)' : 'var(--green)'}">${Math.round(S.pressure)}</b></span><span>Day <b>${uw.calDay}</b></span>${S.jail ? `<span class="chipS red">IN JAIL · ${uw.prison.phone() ? (S.jailPhone ? 'phone' : 'payphone ' + Math.ceil(uw.prison.callT) + 's') : 'no phone'}</span>` : ''}`;
    let h = '';
    if (this.tab === 'home') h = this.t_home();
    else if (this.locked()) h = `<div class="hint">You can’t reach anyone from your cell. The payphone gives you one call a month; a guard might smuggle in a phone, if the money is right and you pick your moment.</div>`;
    else h = this['t_' + this.tab]();
    if (this.msg) h = `<div class="empMsg">${esc(this.msg)}</div>` + h;
    $('empBody').innerHTML = h;
    if (this.tab === 'map' && !this.locked()) this.drawMap();
  }
  bar(v, max, col) { return `<div class="bar"><i style="width:${clamp(v / max, 0, 1) * 100}%;background:${col || 'var(--teal)'}"></i></div>`; }
  wpBtn(x, z, label, key, text = 'Waypoint') { return `<button class="sbtn" data-act="wp:${Math.round(x)}:${Math.round(z)}:${encodeURIComponent(label)}:${encodeURIComponent(key || '')}">${esc(text)}</button>`; }
  // ---------------------------------------------------------------- home screen
  badge(id) {
    const uw = this.uw, S = uw.S;
    if (id === 'feed') return uw.opps.active().filter(o => o.urgent && !o.taken).length + S.decisions.length;
    if (id === 'crew') return S.decisions.length;
    return 0;
  }
  t_home() {
    const cats = [...new Set(PHONE_APPS.map(a => a.cat))];
    return '<div class="appHome">' + cats.map(c => `<h4>${c}</h4><div class="apps">` + PHONE_APPS.filter(a => a.cat === c).map(a => {
      const n = this.badge(a.id), locked = a.tabs ? this.locked(a.tabs[0][0]) : this.uw.inJail;
      return `<button class="app${locked ? ' locked' : ''}" data-act="app:${a.id}" style="--c:${a.col}" aria-label="${esc(a.name)}"><i>${a.icon}</i><b>${esc(a.name)}</b><small>${esc(a.sub)}</small>${n ? `<em>${n}</em>` : ''}</button>`;
    }).join('') + '</div>').join('') + '</div>';
  }
  openApp(id) {
    const g = this.g, a = PHONE_APPS.find(x => x.id === id); if (!a) return;
    if (a.go) {
      if (this.uw.inJail && (a.go !== 'map' || !this.uw.prison.phone())) { this.msg = 'Not from in here.'; this.render(); return; }
      g.ui.closeAll();
      if (a.go === 'map') g.ui.toggleMap(true); else g.taxi.call();
      return;
    }
    this.tab = a.tabs[0][0]; this.msg = ''; this.render(); $('empBody').scrollTop = 0;
  }
  // where each good can be sold, best price first (street corners by district, the fence, the armorer)
  sellQuotes(k) {
    const uw = this.uw, S = uw.S, M = uw.market, g = this.g, G = GOODS[k], out = [];
    if (G.fence) {
      const L = uw.loc('prop', 'pawn'), owned = uw.props.owned('pawn');
      out.push({ name: 'Lucky’s Pawn (fence)', zone: L.zone, price: Math.round(M.price('o', k) * (k === 'hot' ? (owned ? 1.0 : 0.85) : 0.7)), x: L.x, z: L.z, key: 'prop:pawn', known: true, note: 'never calls the police' });
    }
    if (G.arms) { const L = uw.loc('spot', 'armorer'); out.push({ name: 'The Armorer', zone: L.zone, price: Math.round(M.price(L.zone, k) * 0.9), x: L.x, z: L.z, key: 'spot:armorer', known: true, note: 'only arms buyers deal in it' }); }
    if (!G.fence && !G.arms) for (const z of Object.keys(DEMAND)) {
      const turfs = uw.T.filter(t => t.zone === z); if (!turfs.length) continue;
      const known = !!g.save.discovered.zones[z];
      const p = g.player.pos; let best = turfs[0], bd = 1e18; for (const t of turfs) { const d = dist2(t.deal.x, t.deal.z, p.x, p.z); if (d < bd) { bd = d; best = t; } }
      const mine = turfs.filter(t => uw.owner[t.i] === 'pc').length, hostile = turfs.filter(t => uw.owner[t.i] && uw.owner[t.i] !== 'pc' && FACTIONS[uw.owner[t.i]] && uw.attitude(uw.owner[t.i]) === 'hostile').length;
      const risk = turfs.reduce((a, t) => a + uw.ui.dealRisk(t.i), 0) / turfs.length;
      const allDay = ['o', 'h', 'w', 's'].includes(z);
      out.push({ name: `Street buyers · ${ZONES[z].name}`, zone: z, price: M.price(z, k), x: best.deal.x, z: best.deal.z, key: 'deal:' + best.i, known, risk, note: `${allDay ? 'day and night' : 'after dark'}${mine ? ` · +10% on your ${mine} turf${mine > 1 ? 's' : ''}` : ''}${hostile ? ` · ${hostile} hostile turf${hostile > 1 ? 's' : ''}` : ''}` });
    }
    return out.sort((a, b) => b.price - a.price);
  }
  buyQuotes(k) {
    const uw = this.uw, S = uw.S, M = uw.market, g = this.g, out = [];
    for (const s of SPOTS) {
      if (!s.sells || !s.sells.includes(k)) continue;
      const L = uw.loc('spot', s.id), known = g.save.rep >= (s.rep || 0) || !!(S.flags.intro && S.flags.intro[s.id]);
      out.push({ name: s.name, zone: L.zone, price: M.wholesale(L.zone, k), x: L.x, z: L.z, key: 'spot:' + s.id, known, need: s.rep, note: s.role });
    }
    for (const fid of FAC_IDS) {
      const sells = fid === 'tidewater' ? ['snow', 'hardware', 'smokes'] : fid === 'velvet' ? ['pills'] : fid === 'vipers' ? ['green'] : [];
      const f = S.factions[fid]; if (!sells.includes(k) || f.broken) continue;
      const L = uw.loc('hq', fid), ok = g.save.rep >= 300 && f.rel > -20;
      out.push({ name: `${FACTIONS[fid].short} wholesale (${f.boss})`, zone: L.zone, price: Math.round(M.wholesale(FACTIONS[fid].home, k) * (1.05 - clamp(f.rel, -20, 60) / 300)), x: L.x, z: L.z, key: 'hq:' + fid, known: true, gated: !ok, note: ok ? `bulk orders · ${uw.attitude(fid)}` : `needs 300 reputation and their respect (${uw.attitude(fid)})` });
    }
    return out.sort((a, b) => a.price - b.price);
  }
  // MARKET · MY STOCK: what I paid, what it is worth, what I can get for it, am I making money
  t_pnl() {
    const uw = this.uw, S = uw.S, M = uw.market, g = this.g;
    const here = zoneKey(g.player.pos.x, g.player.pos.z), locs = uw.locations({ all: true }), agg = {};
    for (const L of locs) for (const r of holdings(L.o, L.zone, M)) { const a = agg[r.k] || (agg[r.k] = { n: 0, cost: 0, value: 0, at: [] }); a.n += r.n; a.cost += r.cost; a.value += r.value; a.at.push({ L, r }); }
    const rb = S.realBy || {}, ks = GOOD_IDS.filter(k => agg[k] || rb[k]);
    let tv = 0, tc = 0; for (const k in agg) { tv += agg[k].value; tc += agg[k].cost; }
    const sign = v => `<b class="${v >= 0 ? 'up' : 'dn'}">${v >= 0 ? '+' : '−'}${fmtMoney(Math.abs(v))}</b>`;
    let h = `<div class="grid4"><div class="tile"><small>Worth now</small><b class="money">${fmtMoney(tv)}</b><span>at street prices where it sits</span></div><div class="tile"><small>You paid</small><b>${fmtMoney(tc)}</b><span>cost basis</span></div><div class="tile"><small>Unrealised</small><b style="color:${tv - tc >= 0 ? 'var(--green)' : 'var(--red)'}">${tv - tc >= 0 ? '+' : '−'}${fmtMoney(Math.abs(tv - tc))}</b><span>if sold at those prices</span></div><div class="tile"><small>Realised</small><b style="color:${(S.st.realized || 0) >= 0 ? 'var(--green)' : 'var(--red)'}">${(S.st.realized || 0) >= 0 ? '+' : '−'}${fmtMoney(Math.abs(S.st.realized || 0))}</b><span>banked from sales</span></div></div>`;
    if (!ks.length) return h + '<div class="hint">You hold no product. Buy from a supplier (Street Connect shows who sells what), then check back here: every lot remembers what you paid.</div>';
    h += '<div class="grid2 pnl">' + ks.map(k => {
      const a = agg[k], G = GOODS[k], best = this.sellQuotes(k).find(q => q.known), sellHere = !G.fence && !G.arms && DEMAND[here] ? M.price(here, k) : null;
      const top = `<div class="t"><b style="color:${TIERS[G.tier].col}">■</b> ${esc(G.name)}${a ? ` · ${fmtQty(k, a.n)}` : ''}</div>`;
      if (!a) return `<div class="card">${top}<div class="stats"><span>Holding</span><span>none</span><span>Realised P/L</span><span>${sign(rb[k] || 0)}</span></div></div>`;
      const pl = a.value - a.cost, open = this.pnlSel === k;
      return `<div class="card">${top}<div class="stats">
        <span>Average paid</span><span>${a.cost ? fmtPerUnit(k, a.cost / a.n) : 'free'}</span>
        <span>Cost basis</span><span>${fmtMoney(a.cost)}</span>
        <span>Sells here (${esc(ZONES[here] ? ZONES[here].name : 'out of town')})</span><span>${sellHere ? fmtPerUnit(k, sellHere) : '—'}</span>
        <span>Best known price</span><span>${best ? `${fmtPerUnit(k, best.price)} · ${esc(ZONES[best.zone].name)}` : '—'}</span>
        <span>Worth now</span><span class="money">${fmtMoney(a.value)}</span>
        <span>Unrealised P/L</span><span>${sign(pl)}${a.cost ? ` <small>(${pl >= 0 ? '+' : '−'}${Math.abs(Math.round(pl / a.cost * 100))}%)</small>` : ''}</span>
        <span>Realised P/L</span><span>${sign(rb[k] || 0)}</span></div>
        <div class="btns"><button class="sbtn" data-act="pk:${k}">${open ? 'Hide locations' : `Where is it? (${a.at.length})`}</button>${best ? this.wpBtn(best.x, best.z, best.name, best.key, 'Best buyer') : ''}</div>
        ${open ? a.at.map(({ L, r }) => `<div class="stat" style="font-size:12px"><span>${esc(L.name)} · ${fmtQty(k, r.n)} @ ${r.cost ? fmtPerUnit(k, r.avg) : 'free'}</span><span>${fmtMoney(r.value)} ${sign(r.pl)}</span></div>`).join('') : ''}</div>`;
    }).join('') + '</div>';
    return h + '<div class="hint">Worth now values every lot at the street price of the district it sits in, so a rising market shows up here straight away. Selling moves the matching cost basis out with it.</div>';
  }
  // STREET CONNECT: who sells each product to you and who buys it from you
  t_connect() {
    const uw = this.uw, cc = this.cc, carried = uw.carried();
    const chip = (key, v, label) => `<button class="etab${cc[key] === v ? ' on' : ''}" data-act="cc:${key}:${v}">${esc(label)}</button>`;
    let h = `<div class="ccChips">${chip('role', 'both', 'Buy & sell')}${chip('role', 'buy', 'Buy from')}${chip('role', 'sell', 'Sell to')}</div><div class="ccChips">${chip('good', 'all', 'All products')}${GOOD_IDS.map(k => chip('good', k, GOODS[k].name)).join('')}</div>`;
    const row = (q, buy) => {
      if (!q.known) return `<div class="job locked"><i>?</i><div><b>${buy ? 'Unknown supplier' : 'Undiscovered district'}</b><span>${buy ? `Word is someone in ${esc(ZONES[q.zone].name)} deals it. They won’t talk to anyone under ${q.need} reputation.` : `Go to ${esc(ZONES[q.zone].name)} to learn what buyers there pay.`}</span></div></div>`;
      return `<div class="job${q.gated ? ' locked' : ''}"><i style="color:${buy ? '#46d4c4' : '#ffd84d'}">${buy ? '↓' : '$'}</i><div><b>${esc(q.name)}</b><span>${fmtPerUnit(q.k, q.price)} · ${esc(ZONES[q.zone].name)}${q.risk !== undefined ? ` · bust risk ${Math.round(q.risk * 100)}%` : ''}${q.note ? ' · ' + esc(q.note) : ''}</span></div>${this.wpBtn(q.x, q.z, q.name, q.key)}</div>`;
    };
    for (const k of GOOD_IDS) {
      if (cc.good !== 'all' && cc.good !== k) continue;
      const G = GOODS[k];
      h += `<div class="ccGood"><b style="color:${TIERS[G.tier].col}">${esc(G.name)}</b> <small>${esc(TIERS[G.tier].name)} · per ${unitName(k)}${carried[k] ? ` · you carry ${fmtQty(k, carried[k])}` : ''}</small>`;
      if (cc.role !== 'sell') { const b = this.buyQuotes(k).map(q => ({ ...q, k })); h += `<div class="ccRole buy">BUY FROM</div><div class="jobs">${b.length ? b.map(q => row(q, true)).join('') : '<div class="hint">Nobody sells it: it is stolen from the street (pickpocketing, burglary, cars).</div>'}</div>`; }
      if (cc.role !== 'buy') {
        const all = this.sellQuotes(k).map(q => ({ ...q, k })), known = all.filter(q => q.known), unk = all.length - known.length;
        const show = cc.good === 'all' ? known.slice(0, 3) : known;
        h += `<div class="ccRole sell">SELL TO</div><div class="jobs">${show.map(q => row(q, false)).join('')}${!known.length ? '<div class="hint">You haven’t found anywhere to sell it yet.</div>' : ''}</div>${cc.good === 'all' && known.length > 3 ? `<div class="hint">${known.length - 3} more buyer district(s): pick ${esc(G.name)} above to see them all.</div>` : ''}${unk ? `<div class="hint">${unk} district(s) not discovered yet: explore to learn their prices.</div>` : ''}`;
      }
      h += '</div>';
    }
    return h + '<div class="hint">Waypoint sets normal GPS tracking to the contact. Street buyers stand on deal corners; prices move every day.</div>';
  }
  // STASHES: what is kept at each property (product, guns, rounds, vests)
  t_stashes() {
    const uw = this.uw, S = uw.S, M = uw.market, s = this.g.save;
    const own = uw.props.ownedList().filter(d => d.storage);
    let h = '<div class="hint">Deposit and withdraw in person at the property (walk up and open its menu) or send a crew runner (Crew › Deliveries). Stashed goods stay put unless a raid finds them; carried goods are seized if you’re arrested.</div>';
    if (!own.length) return h + '<div class="hint">No property with storage yet. The Property app lists what’s for sale.</div>';
    h += '<div class="grid2">' + own.map(d => {
      const L = uw.loc('prop', d.id), o = S.storage[d.id] || {}, rows = holdings(o, L.zone, M), ws = S.wstash[d.id];
      const guns = ARMORY_GUNS.filter(gid => s.weapons[gid] && s.wloc[gid] === d.id).map(gid => WEAPONS.find(w => w.id === gid).name);
      const ammo = ws ? Object.keys(ws.ammo).filter(k => ws.ammo[k] > 0).map(k => `${ws.ammo[k]} ${WEAPONS.find(w => w.id === k).ammoName}`) : [];
      return `<div class="card"><div class="t">${esc(d.name)} <span class="chip" style="--c:#c9a46b">${LOC_CLASS[d.kind] || 'PROPERTY'}</span></div><div class="d">${esc(ZONES[L.zone].name)}</div>
        <div class="stat"><span>Space</span><span>${units(o)} / ${d.storage}</span></div>${this.bar(units(o), d.storage)}
        ${rows.length ? rows.map(r => `<div class="stat"><span>${GOODS[r.k].name} · ${fmtQty(r.k, r.n)}</span><span>${fmtMoney(r.value)}</span></div>`).join('') : '<div class="d">No product.</div>'}
        <div class="stat"><span>Guns</span><span>${guns.length ? esc(guns.join(', ')) : 'none'}</span></div>
        <div class="stat"><span>Rounds</span><span>${ammo.length ? esc(ammo.join(' · ')) : 'none'}</span></div>
        <div class="stat"><span>Spare vests</span><span>${ws ? ws.vests.length : 0}</span></div>
        <div class="btns">${this.wpBtn(L.x, L.z, d.name, 'prop:' + d.id)}</div></div>`;
    }).join('') + '</div>';
    return h;
  }
  // GARAGE: every car you own, where it is and what is in its trunk
  t_garage() {
    const g = this.g, s = g.save, uw = this.uw;
    let h = `<div class="svcTop"><span>Cars <b>${s.garage.length} / ${g.content.garageCap}</b></span><span>Spaces come with property: garages, homes and the parkade.</span></div>`;
    if (!s.garage.length) return h + '<div class="hint">You don’t own a car. Buy one at the dealership, or drive a car into a free space at your property and stop: it’s yours to keep.</div>';
    h += '<div class="grid2">' + s.garage.map(e => {
      const V = VEHICLES[e.type], live = g.vehicles.list.find(v => v.garageUid === e.uid && !v.burnt);
      const out = e.out && live, at = e.at && PROP_BY_ID[e.at.p] ? PROP_BY_ID[e.at.p] : null, L = at ? uw.loc('prop', at.id) : null;
      const where = out ? (g.player.vehicle === live ? 'You’re driving it' : `Out · ${fmtDist(Math.hypot(live.pos.x - g.player.pos.x, live.pos.z - g.player.pos.z))} away`) : at ? `Parked at ${at.name}` : 'In storage';
      const tune = e.tune ? Object.keys(e.tune).filter(k => e.tune[k] > 0).map(k => `${k} ${e.tune[k]}`).join(', ') : '';
      const wx = out ? live.pos.x : L ? L.x : null, wz = out ? live.pos.z : L ? L.z : null;
      return `<div class="card"><div class="t">${esc(V.name)} ${tierChip(e.vtier)}</div><div class="d">${esc(where)}</div>
        <div class="stat"><span>Condition</span><span style="color:${e.dmg > 60 ? 'var(--red)' : e.dmg > 20 ? 'var(--amber)' : 'var(--green)'}">${Math.round(100 - (e.dmg || 0))}%</span></div>
        ${tune ? `<div class="stat"><span>Upgrades</span><span>${esc(tune)}</span></div>` : ''}
        <div class="stat"><span>Cargo Capacity</span><span>${fmtLb(cargoCapC(e.type))}</span></div>
        <div class="stat"><span>Trunk</span><span>${e.trunk && units(e.trunk) ? esc(goodsList(e.trunk)) + ' · ' + fmtLb(cargoC(e.trunk)) : 'empty'}</span></div>
        <div class="btns">${wx !== null ? this.wpBtn(wx, wz, V.name, out ? null : 'prop:' + at.id) : ''}</div></div>`;
    }).join('') + '</div>';
    return h;
  }
  // ---------------------------------------------------------------- tabs
  t_overview() {
    const uw = this.uw, S = uw.S, g = this.g;
    const crew = uw.crew.active(), biz = uw.props.ownedList();
    const nxt = RANKS[Math.min(RANK_MAX, uw.rank + 1)], miss = uw.rankMissing();
    let h = `<div class="grid4">
      <div class="tile"><small>Cash on you</small><b class="money">${fmtMoney(Money.onMe)}</b></div><div class="tile"><small>Dirty in stashes</small><b class="money">${fmtMoney(Money.dirtyTotal() - Money.onMe)}</b></div><div class="tile"><small>Bank</small><b class="money">${fmtMoney(Money.clean)}</b>${Money.debt > 0 ? `<small>medical debt ${fmtMoney(Money.debt)}</small>` : ''}</div>
      <div class="tile"><small>Rank</small><b>${esc(RANKS[uw.rank].name)}</b><span>${uw.rank + 1} of ${RANKS.length}</span></div>
      <div class="tile"><small>Reputation</small><b>${g.save.rep}</b><span>who knows you</span></div>
      <div class="tile"><small>Influence</small><b>${uw.influence}</b>${this.bar(uw.influence, 1000, '#d28cff')}</div>
      <div class="tile"><small>Police pressure</small><b>${Math.round(S.pressure)}</b>${this.bar(S.pressure, 100, S.pressure > 66 ? '#ff4d5e' : '#ffb547')}</div>
      <div class="tile"><small>Turfs held</small><b>${uw.playerTurfs()} / ${uw.T.length}</b></div>
      <div class="tile"><small>Crew</small><b>${crew.length} / ${uw.crew.cap()}</b></div>
      <div class="tile"><small>Properties</small><b>${biz.length}</b><span>${biz.filter(b => b.kind === 'business').length} businesses</span></div>
      <div class="tile"><small>Product value</small><b class="money">${fmtMoney(uw.locations({ all: true }).reduce((a, L) => a + holdings(L.o, L.zone, uw.market).reduce((x, r) => x + r.value, 0), 0))}</b><span>${units(S.inv)} space carried${S.runs.length ? ' · ' + S.runs.length + ' on the road' : ''}</span></div>
      <div class="tile"><small>Territory tax</small><b class="money">${fmtMoney(uw.T.reduce((a, t, i) => a + (uw.owner[i] === 'pc' ? uw.royalty.owed(i) : 0), 0))}</b><span>expected per day · ${fmtMoney(S.st.royalties || 0)} collected</span></div>
    </div>`;
    h += `<h3>Next step</h3><div class="hint">${uw.rank < RANK_MAX ? esc(RANKS[uw.rank].hint) + (miss.length ? `<br><small>${esc(nxt.name)} still needs: ${esc(miss.join(' · '))}</small>` : '') : 'You run the city. Rivals will form coalitions, lieutenants will get ambitious and the state will send investigators. Hold on to it.'}</div>`;
    if (S.decisions.length) h += `<h3>Waiting on you</h3>` + S.decisions.map(d => `<div class="job open"><i>?</i><div><b>${esc(d.text)}</b></div><button class="sbtn gold" data-act="dec:${d.id}:1">Agree</button><button class="sbtn" data-act="dec:${d.id}:0">Refuse</button></div>`).join('');
    const L = S.lastLedger;
    if (L) {
      const row = (o, sign) => Object.keys(o).map(k => `<span>${sign} ${esc(k)}</span><span>${fmtMoney(o[k])}</span>`).join('');
      h += `<h3>Day ${L.day} books</h3><div class="stats">${row(L.inc, '+') || '<span>No income</span><span>—</span>'}${row(L.exp, '−')}</div>`;
    }
    const today = S.ledger;
    if (Object.keys(today.inc).length || Object.keys(today.exp).length) h += `<h3>Today so far</h3><div class="stats">${Object.keys(today.inc).map(k => `<span>+ ${esc(k)}</span><span>${fmtMoney(today.inc[k])}</span>`).join('')}${Object.keys(today.exp).map(k => `<span>− ${esc(k)}</span><span>${fmtMoney(today.exp[k])}</span>`).join('')}</div>`;
    if (S.jail) h += `<h3>Sentence</h3><div class="hint">${esc(S.jail.charges)}</div><div class="stats"><span>Sentence</span><span>${fmtSentence(S.jail.total)}</span><span>Served</span><span>${fmtSentence(S.jail.served)}</span><span>Remaining</span><span><b>${fmtSentence(S.jail.total - S.jail.served)}</b></span></div>`;
    h += `<h3>Record</h3><div class="stats"><span>Turfs taken / lost</span><span>${S.st.turfsTaken} / ${S.st.turfsLost}</span><span>Bosses beaten</span><span>${S.st.bossesBeaten}</span><span>Lots sold</span><span>${S.st.sold}</span><span>Realised profit</span><span>${fmtMoney(S.st.realized || 0)}</span><span>Deliveries (clean / sent)</span><span>${S.st.runsOk || 0} / ${S.st.runs || 0}</span><span>Cars chopped</span><span>${S.st.chopped}</span><span>Prior convictions</span><span>${S.rap.priors}</span><span>Days served</span><span>${S.st.jailDays}</span></div>`;
    return h;
  }
  t_map() {
    const uw = this.uw, S = uw.S;
    let h = `<div class="mapWrap"><canvas id="empMap" width="1024" height="1024"></canvas><div class="mapSide">`;
    h += `<div class="legendS"><span><i style="background:${PLAYER_COL}"></i>You</span>${FAC_IDS.map(id => `<span><i style="background:${FACTIONS[id].col}"></i>${FACTIONS[id].short}</span>`).join('')}<span><i class="hatch"></i>Contested</span><span><i style="background:#555"></i>Neutral</span></div>`;
    h += this.turfCard(this.selTurf);
    return h + '</div></div>';
  }
  turfCard(i) {
    const uw = this.uw, S = uw.S;
    if (i === null || i === undefined) return '<div class="hint">Tap a turf for details.</div>';
    const t = uw.T[i], T = S.turfs[i], own = uw.owner[i];
    const ownName = own === 'pc' ? 'You' : own ? FACTIONS[own].name : 'Nobody (neutral)';
    const rivals = Object.keys(T.inf).filter(k => k !== 'pc').sort((a, b) => T.inf[b] - T.inf[a]);
    const props = uw.props.ownedList().filter(p => { const L = uw.loc('prop', p.id); return L && turfAt(L.x, L.z) === i; });
    const crew = uw.crew.active().filter(c => c.assign === i || uw.crew.ltZone(c) === t.zone);
    const dem = GOOD_IDS.filter(k => !GOODS[k].fence).sort((a, b) => uw.market.ratio(t.zone, b) - uw.market.ratio(t.zone, a)).slice(0, 2);
    const risk = Math.round(clamp(T.police * 0.6 + S.pressure * 0.4 + (own && own !== 'pc' && uw.attitude(own) === 'hostile' ? 25 : 0), 0, 100));
    return `<div class="turfCard"><b>${esc(t.name)}</b><small>${esc(ZONES[t.zone].name)}</small>
      <div class="stats"><span>Controlled by</span><span style="color:${own === 'pc' ? PLAYER_COL : own ? FACTIONS[own].col : '#aaa'}">${esc(ownName)}${uw.contested[i] ? ' · contested' : ''}</span>
      <span>Your influence</span><span>${Math.round(T.inf.pc || 0)}</span>
      <span>Rival strength</span><span>${rivals.length ? rivals.map(k => `${FACTIONS[k].short} ${Math.round(T.inf[k])}`).join(', ') : '—'}</span>
      <span>Police presence</span><span>${Math.round(T.police)}</span>
      <span>Your businesses</span><span>${props.length ? props.map(p => esc(p.name)).join(', ') : '—'}</span>
      <span>Crew assigned</span><span>${crew.length ? crew.map(c => esc(c.name.split(' ')[0]) + ' (' + CREW_ROLES[c.role].name + ')').join(', ') : '—'}</span>
      <span>Local demand</span><span>${dem.map(k => `${GOODS[k].name} ${fmtMoney(uw.market.price(t.zone, k))}`).join(', ')}</span>
      <span>Local risk</span><span>${risk}%</span>
      ${(() => { const rc = uw.royalty.card(i); if (!rc) return ''; const st = ROY_STATUS[rc.status] || ROY_STATUS.none; return `<span>Territory revenue</span><span>${fmtMoney(rc.expected)}/day expected · last ${fmtMoney(rc.last)}</span><span>Who pays</span><span>${rc.payer ? esc(FACTIONS[rc.payer].short) + ' · ' + Math.round(rc.compliance * 100) + '% likely to pay' : 'your own street businesses'}</span><span>Tax status</span><span style="color:${st[1]}">${st[0]}</span>`; })()}
      ${T.war ? `<span>${T.war.a === 'pc' ? 'Showdown' : 'War'}</span><span style="color:var(--red)">${T.war.a === 'pc' ? 'You' : FACTIONS[T.war.a].short} vs ${T.war.d === 'pc' ? 'you' : T.war.d ? FACTIONS[T.war.d].short : 'locals'} · ${Math.ceil(T.war.hrs)}h</span>` : ''}</div>
      ${this.takeRow(i)}
      <div class="btns">${this.wpBtn(t.hang.x, t.hang.z, t.name)}</div></div>`;
  }
  // Take Turf (§4): inspect, weaken, reach the threshold, call the showdown. Ownership changes only when it is won.
  takeRow(i) {
    const uw = this.uw, T = uw.S.turfs[i]; if (uw.owner[i] === 'pc') return '';
    const c = uw.takeCheck(i);
    const why = c.ok ? (c.offered ? `The ${FACTIONS[T.offer.fid].short} are stepping aside: take it without a fight.` : 'Your hold is strong enough. Calling it starts a showdown: be there, or your Enforcers on the turf fight it out.') : c.why;
    return `<div class="hint">${esc(why)}</div><div class="btns"><button class="sbtn ${c.ok ? 'gold' : ''}" data-act="take:${i}" ${c.ok ? '' : 'disabled'}>TAKE TURF</button></div>`;
  }
  drawMap() {
    const cv = $('empMap'); if (!cv) return;
    const c = cv.getContext('2d'), ui = this.g.ui;
    c.drawImage(ui.mapImg, 0, 0, 1024, 1024);
    this.drawOverlay(c, true);
    const p = this.g.player; const [px, pz] = ui._mapXY(p.pos.x, p.pos.z);
    c.fillStyle = '#ffb547'; c.strokeStyle = '#000'; c.lineWidth = 3; c.beginPath(); c.arc(px, pz, 11, 0, 7); c.fill(); c.stroke();
    if (this.selTurf !== null) { const t = this.uw.T[this.selTurf]; const [x0, z0] = ui._mapXY(t.tx * 2 * P, t.tz * 2 * P); const s = 2 * P * ui.mapK; c.strokeStyle = '#fff'; c.lineWidth = 5; c.strokeRect(x0 + 3, z0 + 3, s - 6, s - 6); }
  }
  // turf colours, contested hatching, wars and points of interest
  drawOverlay(c, full) {
    const uw = this.uw, S = uw.S, ui = this.g.ui, k = ui.mapK;
    const s = 2 * P * k;
    for (let i = 0; i < uw.T.length; i++) {
      const t = uw.T[i], own = uw.owner[i];
      const [x0, z0] = ui._mapXY(t.tx * 2 * P, t.tz * 2 * P);
      const col = own === 'pc' ? PLAYER_COL : own ? FACTIONS[own].col : '#666a70';
      c.globalAlpha = own ? 0.34 : 0.14; c.fillStyle = col; c.fillRect(x0, z0, s, s);
      c.globalAlpha = 0.9; c.strokeStyle = col; c.lineWidth = own === 'pc' ? 4 : 2; c.strokeRect(x0 + 2, z0 + 2, s - 4, s - 4);
      if (uw.contested[i]) { c.save(); c.beginPath(); c.rect(x0, z0, s, s); c.clip(); c.strokeStyle = 'rgba(255,255,255,0.35)'; c.lineWidth = 3; for (let d = -s; d < s; d += 18) { c.beginPath(); c.moveTo(x0 + d, z0); c.lineTo(x0 + d + s, z0 + s); c.stroke(); } c.restore(); }
      c.globalAlpha = 1;
      c.font = 'bold 13px Arial'; c.textAlign = 'center'; c.fillStyle = 'rgba(0,0,0,0.7)'; c.fillText(t.name, x0 + s / 2 + 1, z0 + 17);
      c.fillStyle = '#fff'; c.fillText(t.name, x0 + s / 2, z0 + 16);
      if (S.turfs[i].war) { c.font = 'bold 26px Arial'; c.fillStyle = '#ff4d5e'; c.fillText('⚔', x0 + s / 2, z0 + s / 2 + 9); }
    }
    if (!full) return;
    const icon = (x, z, col, txt) => { const [mx, mz] = ui._mapXY(x, z); c.fillStyle = col; c.strokeStyle = '#000'; c.lineWidth = 2; c.beginPath(); c.rect(mx - 9, mz - 9, 18, 18); c.fill(); c.stroke(); c.fillStyle = '#111'; c.font = 'bold 12px Arial'; c.textAlign = 'center'; c.fillText(txt, mx, mz + 4); };
    for (const L of uw.locs) {
      if (L.kind === 'prop') icon(L.x, L.z, uw.props.owned(L.id) ? '#8fe39b' : '#e8eef6', L.def.kind === 'business' ? 'B' : L.def.kind === 'safehouse' ? 'H' : L.def.kind === 'garage' ? 'G' : L.def.kind === 'motorsport' ? 'M' : L.def.kind === 'offroad' ? 'O' : 'W');
      else if (L.kind === 'hq' && !S.factions[L.id].broken) icon(L.x, L.z, FACTIONS[L.id].col, '♛');
      else if (L.kind === 'spot') icon(L.x, L.z, '#' + new THREE.Color(L.col).getHexString(), L.def.chop ? 'C' : L.def.arms ? 'A' : L.def.fixer ? 'L' : 'S');
    }
    const pd = this.g.world.places.police.door; icon(pd.x, pd.z, '#4d8dff', 'P');
  }
  t_crew() {
    const uw = this.uw, S = uw.S, g = this.g, CM = uw.crew;
    const ros = CM.roster();
    let h = `<div class="svcTop"><span>Crew <b>${CM.active().length} / ${CM.cap()}</b></span><span>Daily wages <b>${fmtMoney(CM.payroll())}</b></span><span>${Money.html('crewFee')}</span></div>`;
    // payroll (§45.21): Dirty Cash only, drawn in this order every morning; no bank fallback
    const pay = CM.payroll(), reserve = Money.payrollReserve(), days = CM.payrollDays();
    h += `<div class="card"><div class="t">Payroll</div><div class="stat"><span>Daily payroll</span><span><b>${fmtMoney(pay)}</b></span></div><div class="stat"><span>Payroll reserve (Dirty Cash)</span><span class="money"><b>${fmtMoney(reserve)}</b></span></div><div class="stat"><span>Days covered</span><span style="color:${pay > 0 && days < 3 ? 'var(--red)' : 'var(--text)'}"><b>${pay > 0 ? (days > 999 ? '999+' : days) : '—'}</b></span></div>
      <div class="d" style="margin-top:4px">Paid from, in order: ${Money.payrollSources().map(s => `${esc(s.name)} <b>${fmtMoney(s.amt)}</b>`).join(' → ')}. Wages are never taken from the bank.</div></div>`;
    if (!ros.length) h += `<div class="hint">No crew yet. ${CM.canRecruit() ? 'Hire someone below.' : 'Earn 100 reputation and people will start asking for work.'}</div>`;
    const turfOpts = sel => uw.T.map(t => `<option value="${t.i}" ${sel === t.i ? 'selected' : ''}>${esc(t.name)} · ${uw.owner[t.i] === 'pc' ? 'yours' : uw.owner[t.i] ? FACTIONS[uw.owner[t.i]].short : 'neutral'}</option>`).join('');
    // districts with turfs (a Lieutenant runs streets: Valen Point has none)
    const zoneOpts = sel => Object.keys(ZONES).filter(z => uw.T.some(t => t.zone === z)).map(z => `<option value="${z}" ${sel === z ? 'selected' : ''}>${esc(ZONES[z].name)}</option>`).join('');
    const bizOpts = sel => uw.props.ownedList().filter(p => p.kind === 'business').map(p => `<option value="${p.id}" ${sel === p.id ? 'selected' : ''}>${esc(p.name)}</option>`).join('');
    // a warehouse as the target ('w:<id>'), with how full it is
    const whOpts = sel => uw.whse.list().map(p => `<option value="w:${p.id}" ${sel === 'w:' + p.id ? 'selected' : ''}>${esc(p.name)} · ${uw.whse.slotsUsed(p.id)}/${WH_SLOTS}</option>`).join('');
    h += '<div class="grid2">' + ros.map(c => {
      const R = CREW_ROLES[c.role];
      let target = '';
      if (c.status === 'active') {
        const whs = R.wh ? whOpts(c.assign) : '';
        if (c.role === 'driver') target = `<select data-sel="tgt:${c.id}">${whs || '<option value="">— buy a warehouse —</option>'}</select>`;
        else if (R.turf) target = `<select data-sel="tgt:${c.id}">${whs ? `<optgroup label="Guard a warehouse">${whs}</optgroup><optgroup label="Hold a turf">` : ''}${turfOpts(c.assign)}${whs ? '</optgroup>' : ''}</select>`;
        else if (R.zone) target = `<select data-sel="tgt:${c.id}">${whs ? `<optgroup label="Run a warehouse">${whs}</optgroup><optgroup label="Run a district">` : ''}${zoneOpts(c.assign)}${whs ? '</optgroup>' : ''}</select>`;
        // a Dealer's corner is supplied from one warehouse (the nearest unless you pick)
        if (c.role === 'dealer' && typeof c.assign === 'number' && uw.whse.list().length) { const cur = uw.whse.supplierOf(c); target += `<select data-sel="from:${c.id}">${uw.whse.list().map(p => `<option value="${p.id}" ${cur === p.id ? 'selected' : ''}>Supplied by ${esc(p.name)}</option>`).join('')}</select><div class="d">On the corner: ${units(uw.whse.turfStock(c.assign))}/${TURF_STOCK_CAP}</div>`; }
        else if (R.biz) target = `<select data-sel="tgt:${c.id}"><option value="">— business —</option>${bizOpts(c.assign)}</select>`;
      }
      const roleSel = c.status === 'active' ? `<select data-sel="role:${c.id}">${Object.keys(CREW_ROLES).map(k => `<option value="${k}" ${c.role === k ? 'selected' : ''} ${CREW_ROLES[k].minRank && c.rank < CREW_ROLES[k].minRank ? 'disabled' : ''}>${CREW_ROLES[k].name}</option>`).join('')}</select>` : '';
      const status = c.status === 'active' ? '' : `<span class="chip" style="--c:${c.status === 'jailed' ? '#4d8dff' : '#ff8a3d'}">${c.status === 'jailed' ? 'IN JAIL' : 'HURT'} · ${c.out}d</span>`;
      const promo = c.rank < 4 ? `<button class="sbtn" data-act="promo:${c.id}" ${!Money.can(PROMO_COST[c.rank + 1], 'crewFee') ? 'disabled' : ''}>Promote ${fmtMoney(PROMO_COST[c.rank + 1])}</button>` : '';
      return `<div class="card"><div class="t">${esc(CM.displayName(c))} ${status}</div><div class="d">${CREW_RANKS[c.rank]} · ${esc(R.name)}${c.assign !== null && c.assign !== undefined ? ' · ' + esc(typeof c.assign === 'number' ? uw.T[c.assign].name : ZONES[c.assign] ? ZONES[c.assign].name : PROP_BY_ID[c.assign] ? PROP_BY_ID[c.assign].name : '') : ''}<br>${c.traits.map(t => `<span class="chip" style="--c:#9aa3b2" title="${esc(TRAITS[t].desc)}">${TRAITS[t].name}</span>`).join('')} ${fmtMoney(CM.dailyPay(c))}/day${c.unpaid ? ` · <b style="color:var(--red)">unpaid ${c.unpaid}d</b>` : ''}</div>
        <div class="stat"><span>Skill</span><span>${Math.round(c.skill)}</span></div>${this.bar(c.skill, 100)}
        <div class="stat"><span>Loyalty</span><span>${Math.round(c.loyalty)}</span></div>${this.bar(c.loyalty, 100, c.loyalty < 30 ? '#ff4d5e' : c.loyalty < 50 ? '#ffb547' : '#7fe08f')}
        <div class="stat"><span>Morale</span><span>${c.morale >= 0.5 ? '+' + Math.round(c.morale) : '—'}</span></div>
        <div class="stat"><span>Fear</span><span>${Math.round(c.fear)}</span></div>${this.bar(c.fear, 100, '#9aa3b2')}
        <div class="stat"><span>Power</span><span>${Math.round(c.power)}</span></div>${this.bar(c.power, 100, '#d28cff')}
        ${roleSel}${target}
        <div class="btns">${promo}<button class="sbtn" data-act="bonus:${c.id}">Bonus</button><button class="sbtn" data-act="disc:${c.id}">Discipline</button><button class="sbtn danger" data-act="fire:${c.id}">Let go</button></div></div>`;
    }).join('') + '</div>';
    if (!S.cand.length && CM.canRecruit()) CM.refreshCandidates(true);
    h += `<h3>People looking for work <small>${CM.canRecruit() ? 'new faces every couple of days' : 'locked until 100 reputation'}</small></h3><div class="grid2">` + S.cand.map((c, i) => `<div class="card${CM.canRecruit() ? '' : ' locked'}"><div class="t">${esc(CM.displayName(c))}</div><div class="d">${c.traits.map(t => `<span class="chip" style="--c:#9aa3b2" title="${esc(TRAITS[t].desc)}">${TRAITS[t].name}</span>`).join('')}<br>Wants ${fmtMoney(c.pay)}/day</div>
      <div class="stat"><span>Skill</span><span>${Math.round(c.skill)}</span></div>${this.bar(c.skill, 100)}<div class="stat"><span>Loyalty</span><span>${Math.round(c.loyalty)}</span></div>${this.bar(c.loyalty, 100, '#7fe08f')}
      <button class="sbtn gold" data-act="hire:${i}" ${!CM.canRecruit() || !Money.can(c.fee, 'crewFee') || CM.active().length >= CM.cap() ? 'disabled' : ''}>Hire · ${fmtMoney(c.fee)}</button></div>`).join('') + '</div>';
    h += `<h3>Roles</h3><div class="stats">${Object.values(CREW_ROLES).map(r => `<span>${r.name}</span><span style="text-align:left;color:var(--dim)">${esc(r.desc)}</span>`).join('')}</div>`;
    return h;
  }
  // ---- PROPERTY: 45 homes plus garages and warehouses, filtered, searched and sorted
  t_assets() {
    const uw = this.uw, PM = uw.props, f = this.pf || (this.pf = { own: 'all', zone: 'all', tier: 'all', sort: 'price', need: 'any', q: '' });
    const opts = (key, list, cur) => `<select data-sel="pf:${key}" aria-label="${key}">${list.map(([v, t]) => `<option value="${esc(v)}" ${String(v) === String(cur) ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select>`;
    const zones = [...new Set(PROPS.filter(d => d.kind !== 'business').map(d => (uw.loc('prop', d.id) || {}).zone).filter(Boolean))];
    const owned = PROPS.filter(d => d.kind !== 'business' && PM.owned(d.id));
    let h = `<div class="tiles"><div class="tile"><small>Homes owned</small><b>${owned.filter(d => d.kind === 'safehouse').length} / ${PROPS.filter(d => d.kind === 'safehouse').length}</b></div><div class="tile"><small>Parking</small><b>${PM.garageCap()}</b><span>spaces</span></div><div class="tile"><small>Crew room</small><b>${uw.crew.cap()}</b></div></div>`;
    h += `<div class="filt">${opts('own', [['all', 'All'], ['owned', 'Owned'], ['sale', 'For sale']], f.own)}${opts('zone', [['all', 'Every district'], ...zones.map(z => [z, ZONES[z].name])], f.zone)}${opts('tier', [['all', 'Any tier'], ['1', 'Rooms & bedsits'], ['2', 'Apartments & starters'], ['3', 'Houses'], ['4', 'Upscale'], ['5', 'Luxury'], ['6', 'Penthouse & estate'], ['sig', 'Signature homes'], ['other', 'Garages & warehouses']], f.tier)}${opts('need', [['any', 'Any parking/storage'], ['g2', '2+ parking'], ['g3', '3+ parking'], ['s100', '100+ storage'], ['s300', '300+ storage']], f.need)}${opts('sort', [['price', 'Price ↑'], ['price-', 'Price ↓'], ['tier', 'Tier'], ['name', 'Name'], ['zone', 'District']], f.sort)}<input id="propSearch" class="search" type="search" placeholder="Search name, street, district" value="${esc(f.q)}" autocomplete="off"></div>`;
    return h + `<div id="propList">${this.propListHTML()}</div>`;
  }
  propListHTML() {
    const uw = this.uw, S = uw.S, PM = uw.props, f = this.pf;
    const q = (f.q || '').trim().toLowerCase();
    let list = PROPS.filter(d => d.kind !== 'business').map(d => ({ d, L: uw.loc('prop', d.id), own: PM.owned(d.id) })).filter(x => x.L);
    if (f.own === 'owned') list = list.filter(x => x.own); else if (f.own === 'sale') list = list.filter(x => !x.own);
    if (f.zone !== 'all') list = list.filter(x => x.L.zone === f.zone);
    if (f.tier === 'sig') list = list.filter(x => x.d.sig); else if (f.tier === 'other') list = list.filter(x => x.d.kind !== 'safehouse'); else if (f.tier !== 'all') list = list.filter(x => String(x.d.tier) === f.tier);
    if (f.need !== 'any') { const n = +f.need.slice(1); list = list.filter(x => f.need[0] === 'g' ? PM.capOf(x.d) >= n : PM.storageCap(x.d.id) >= n); }
    if (q) list = list.filter(x => (x.d.name + ' ' + (x.d.type || '') + ' ' + ZONES[x.L.zone].name + ' ' + (x.d.kind)).toLowerCase().includes(q));
    const by = { price: (a, b) => a.d.price - b.d.price, 'price-': (a, b) => b.d.price - a.d.price, tier: (a, b) => (a.d.tier || 0) - (b.d.tier || 0) || a.d.price - b.d.price, name: (a, b) => a.d.name.localeCompare(b.d.name), zone: (a, b) => ZONES[a.L.zone].name.localeCompare(ZONES[b.L.zone].name) || a.d.price - b.d.price }[f.sort] || ((a, b) => a.d.price - b.d.price);
    // the default view puts what you own first; an explicit sort is honoured as asked
    list.sort(f.sort === 'price' ? (a, b) => (b.own - a.own) || by(a, b) : by);
    if (!list.length) return '<div class="hint">Nothing matches. Try another filter.</div>';
    return `<div class="hint" style="margin:4px 0">${list.length} propert${list.length === 1 ? 'y' : 'ies'}</div><div class="grid2">` + list.map(({ d, L, own }) => {
      const o = S.props[d.id] || {}, hood = d.kind === 'safehouse' ? HOOD[L.zone] : null;
      const facts = [d.type || d.kind, d.finish ? d.finish + ' finish' : '', PM.capOf(d) ? PM.parkingText(d) : 'no parking', PM.storageCap(d.id) ? PM.storageCap(d.id) + ' storage' : '', d.crew ? `${d.crew} crew` : '', d.sec ? `security ${d.sec}/5` : '', d.infl ? `+${d.infl} influence` : ''].filter(Boolean).join(' · ');
      return `<div class="card${own ? ' own' : ''}"><div class="t">${esc(d.name)} ${d.sig ? '<span class="chip" style="--c:#ffd84d">SIGNATURE</span>' : ''}${own ? '<span class="chip" style="--c:#8fe39b">YOURS</span>' : ''}</div><div class="d">${esc(ZONES[L.zone].name)}${d.tier ? ' · tier ' + d.tier : ''} · ${esc(facts)}</div>${hood ? `<div class="d" style="font-size:11px;color:var(--teal)">${esc(hood.perk)}</div>` : ''}
        ${own && PM.storageCap(d.id) ? `<div class="stat"><span>Stash</span><span>${units(S.storage[d.id])} / ${PM.storageCap(d.id)}</span></div>` : ''}${o.dmg ? `<div class="stat" style="color:var(--red)"><span>Damaged</span><span><button class="sbtn gold" data-act="repair:${d.id}">Repair ${fmtMoney(PM.repairCost(d))}</button></span></div>` : ''}
        <div class="stat"><span>${own ? 'Bought for' : 'Price'}</span><span class="money">${fmtMoney(own ? d.price : PM.price(d))}</span></div><div class="btns">${this.wpBtn(L.x, L.z, d.name)}</div></div>`;
    }).join('') + '</div>';
  }
  // ---- BUSINESS: 50 businesses; owned ones show level, income, costs, manager, benefit and the next upgrade
  bizCard(d, inProp) {
    const uw = this.uw, PM = uw.props, own = PM.owned(d.id), C2 = BIZ_CATS[d.cat], L = uw.loc('prop', d.id), o = uw.S.props[d.id] || {};
    const lv = PM.level(d.id), B = own ? PM.bizDay(d) : PM.bizPreview(d), mgr = own ? PM.manager(d.id) : null, next = own && lv < 3 ? PM.upgradeCost(d.id) : 0;
    const val = C2.lv[Math.max(1, lv) - 1];
    return `<div class="card biz${own ? ' own' : ''}" style="--c:${C2.col}"><div class="t">${C2.icon} ${esc(d.name)} ${own ? `<span class="chip" style="--c:${C2.col}">LEVEL ${lv}</span>` : ''}</div>
      <div class="d">${esc(C2.name)} · ${esc(ZONES[L.zone].name)}${own ? ' · ' + BIZ_LEVEL_NAME[lv - 1] : ''}</div>
      <div class="stats"><span>${own ? 'Bought for' : 'Price'}</span><span class="money">${fmtMoney(own ? d.price : PM.price(d))}</span><span>Income</span><span class="money">${fmtMoney(B.gross)}/day</span><span>Running costs</span><span>${fmtMoney(B.upkeep)}/day</span><span>Net</span><span class="money"><b>${fmtMoney(B.net)}/day</b></span>${own ? `<span>Manager</span><span>${mgr ? esc(uw.crew.displayName(mgr)) + ' (+income, −costs)' : 'none · assign one in Crew'}</span>` : ''}<span>Benefit</span><span>${esc(C2.benefit(val))}</span>${own && o.dmg ? '<span style="color:var(--red)">Damaged</span><span style="color:var(--red)">income and benefit halved until repaired</span>' : ''}</div>
      ${own && lv < 3 ? `<div class="hint" style="font-size:12px">Next: <b>${esc(C2.up[lv - 1])}</b> → ${esc(C2.benefit(C2.lv[lv]))}, income ×${(C2.inc[lv] / C2.inc[lv - 1]).toFixed(2)}</div>` : own ? '<div class="hint" style="font-size:12px">Fully developed.</div>' : ''}
      <div class="btns">${own && lv < 3 ? `<button class="sbtn gold" data-act="${inProp ? 'upgrade' : 'bup:' + d.id}" ${!Money.can(next, 'property') || o.dmg ? 'disabled' : ''}>Upgrade · ${fmtMoney(next)}</button>` : ''}${inProp ? '' : this.wpBtn(L.x, L.z, d.name)}</div></div>`;
  }
  t_biz() {
    const uw = this.uw, PM = uw.props, f = this.bf || (this.bf = { own: 'all', cat: 'all', zone: 'all', sort: 'income-', q: '' });
    const all = PROPS.filter(d => d.kind === 'business'), owned = all.filter(d => PM.owned(d.id));
    let net = 0, gross = 0; for (const d of owned) { const B = PM.bizDay(d); net += B.net; gross += B.gross; }
    const opts = (key, list, cur) => `<select data-sel="bf:${key}" aria-label="${key}">${list.map(([v, t]) => `<option value="${esc(v)}" ${String(v) === String(cur) ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select>`;
    const cats = [...new Set(all.map(d => d.cat))].sort((a, b) => BIZ_CATS[a].name.localeCompare(BIZ_CATS[b].name));
    const zones = [...new Set(all.map(d => uw.loc('prop', d.id).zone))];
    let h = `<div class="tiles"><div class="tile"><small>Businesses owned</small><b>${owned.length} / ${all.length}</b></div><div class="tile"><small>Net per day</small><b class="money">${fmtMoney(net)}</b><span>${fmtMoney(gross)} in</span></div><div class="tile"><small>Fully developed</small><b>${owned.filter(d => PM.level(d.id) === 3).length}</b></div></div>`;
    h += `<div class="filt">${opts('own', [['all', 'All'], ['owned', 'Owned'], ['sale', 'For sale']], f.own)}${opts('cat', [['all', 'Every kind'], ...cats.map(c => [c, BIZ_CATS[c].icon + ' ' + BIZ_CATS[c].name])], f.cat)}${opts('zone', [['all', 'Every district'], ...zones.map(z => [z, ZONES[z].name])], f.zone)}${opts('sort', [['income-', 'Income ↓'], ['price', 'Price ↑'], ['price-', 'Price ↓'], ['level', 'Level'], ['name', 'Name']], f.sort)}<input id="bizSearch" class="search" type="search" placeholder="Search name, kind, district" value="${esc(f.q)}" autocomplete="off"></div>`;
    return h + `<div id="bizList">${this.bizListHTML()}</div>`;
  }
  bizListHTML() {
    const uw = this.uw, PM = uw.props, f = this.bf, q = (f.q || '').trim().toLowerCase();
    let list = PROPS.filter(d => d.kind === 'business');
    if (f.own === 'owned') list = list.filter(d => PM.owned(d.id)); else if (f.own === 'sale') list = list.filter(d => !PM.owned(d.id));
    if (f.cat !== 'all') list = list.filter(d => d.cat === f.cat);
    if (f.zone !== 'all') list = list.filter(d => uw.loc('prop', d.id).zone === f.zone);
    if (q) list = list.filter(d => (d.name + ' ' + BIZ_CATS[d.cat].name + ' ' + ZONES[uw.loc('prop', d.id).zone].name).toLowerCase().includes(q));
    const inc = d => PM.owned(d.id) ? PM.bizDay(d).net : PM.bizPreview(d).net;
    const by = { 'income-': (a, b) => inc(b) - inc(a), price: (a, b) => a.price - b.price, 'price-': (a, b) => b.price - a.price, level: (a, b) => PM.level(b.id) - PM.level(a.id), name: (a, b) => a.name.localeCompare(b.name) }[f.sort] || ((a, b) => a.price - b.price);
    list.sort(f.sort === 'income-' ? (a, b) => (PM.owned(b.id) - PM.owned(a.id)) || by(a, b) : by);
    if (!list.length) return '<div class="hint">Nothing matches. Try another filter.</div>';
    return `<div class="hint" style="margin:4px 0">${list.length} business${list.length === 1 ? '' : 'es'} · buy them in person at their door (white marker)</div><div class="grid2">` + list.map(d => this.bizCard(d, false)).join('') + '</div>';
  }
  t_market() {
    const uw = this.uw, M = uw.market, zones = Object.keys(DEMAND);
    let h = `<div class="hint">Street prices per lb (Green, Pharma, Snow) or per piece. ▲▼ = change since yesterday. Supply shocks (police seizures, port busts, gang wars) push prices up; dumping product pushes them down. What you hold rises and falls with these prices: see Inventory.</div><div class="mtable"><table><tr><th>Good</th>${zones.map(z => `<th>${esc(ZONES[z].name)}</th>`).join('')}</tr>`;
    for (const k of GOOD_IDS) {
      const G = GOODS[k];
      h += `<tr><td><b>${G.name}</b> <small>/${unitName(k)}</small><br><small style="color:${TIERS[G.tier].col}">${TIERS[G.tier].name}</small></td>` + zones.map(z => {
        const p = M.price(z, k), r = p / G.base, tr = M.trend(z, k);
        const col = r > 1.3 ? '#7fe08f' : r < 0.8 ? '#ff8d98' : '#e8eef6';
        return `<td style="color:${col}">${fmtMoney(perUnit(k, p))}${Math.abs(tr) > 0.05 ? `<small>${tr > 0 ? '▲' : '▼'}</small>` : ''}</td>`;
      }).join('') + '</tr>';
    }
    h += '</table></div>';
    h += `<h3>Where to buy</h3><div class="stats">${SPOTS.filter(s => s.sells).map(s => { const L = uw.loc('spot', s.id); return `<span>${esc(s.name)} · ${s.sells.map(k => GOODS[k].name).join(', ')}</span><span>${esc(ZONES[L.zone].name)}${s.rep ? ' · rep ' + s.rep : ''}</span>`; }).join('')}<span>Tidewater Syndicate (Captain Holm)</span><span>Snow, hardware, smokes · talk at their HQ</span><span>Lucky’s Pawn (fence)</span><span>Hot goods, smokes</span></div>`;
    return h;
  }
  // INVENTORY: a live transfer screen for whatever is within reach (pockets, the car you are in or beside, the stash
  // and garage of the property you are at), over a citywide ledger of everything you own. Remote places are shown
  // dimmed and read-only: product only crosses town with a crew runner (Deliveries).
  t_stash() {
    const uw = this.uw, S = uw.S, M = uw.market;
    const locs = uw.locations({ all: true }), near = locs.filter(L => L.here);
    const ek = k => k.replace(/:/g, '~');
    const spaceTxt = L => L.lb ? `${fmtLb(cargoC(L.o))} / ${fmtLb(L.capC)}` : `${units(L.o)} / ${L.cap} space`;
    let tv = 0, tc = 0, h = '';
    // ---- transfers
    const X = this.xfer || (this.xfer = { from: 'inv', to: '' });
    if (!near.some(L => L.key === X.from)) X.from = 'inv';
    if (!near.some(L => L.key === X.to) || X.to === X.from) { const t = near.find(L => L.key !== X.from); X.to = t ? t.key : ''; }
    h += `<h3>Within reach <small>${near.length > 1 ? 'tap where from and where to, then an amount' : ''}</small></h3>`;
    if (near.length < 2) h += '<div class="hint">Only your pockets are within reach. Sit in or stand beside a car to use its trunk; at a property you own, its stash and the cars in its garage join in. Product across town moves with a crew runner (Crew › Deliveries).</div>';
    else {
      const A = near.find(L => L.key === X.from), B = near.find(L => L.key === X.to);
      const chips = (which, cur, skip) => `<div class="xsel">${near.filter(L => L.key !== skip).map(L => `<button class="sbtn${L.key === cur ? ' gold' : ''}" data-act="xf:${which}:${ek(L.key)}">${esc(L.name)}<small>${esc(L.cls)} · ${spaceTxt(L)}</small></button>`).join('')}</div>`;
      h += `<div class="stat"><span>From</span></div>${chips('from', X.from, '')}<div class="stat"><span>To</span><span><button class="sbtn" data-act="xf:swap" style="min-height:40px;padding:6px 12px">⇅ Swap</button></span></div>${chips('to', X.to, X.from)}`;
      const goods = GOOD_IDS.filter(k => Inv.has(A.o, k) > 0);
      if (!goods.length) h += `<div class="hint">${esc(A.name)} is empty.</div>`;
      else h += goods.map(k => {
        const have = Inv.has(A.o, k), fit = uw.fitIn(B, k), lb = GOOD_UNIT[k][2] < 1;
        const amt = [1, 5, 10].map(q => [lb ? q + ' lb' : String(q), lotsFor(k, q)]);
        const wt = A.lb || B.lb ? ` · ${fmtLb(have * GOOD_CLB[k])}` : '';
        return `<div class="xrow"><div class="xh"><span><b style="color:${TIERS[GOODS[k].tier].col}">■</b> <b>${GOODS[k].name}</b> · ${fmtQty(k, have)}${wt}</span><small>${esc(B.name)} has ${fmtQty(k, Inv.has(B.o, k))} · room for ${fmtQty(k, fit)}</small></div>
          <div class="xq">${amt.map(([t, n]) => `<button class="sbtn" data-act="xm:${k}:${n}" ${fit < 1 ? 'disabled' : ''}>${t}</button>`).join('')}<button class="sbtn gold" data-act="xm:${k}:-1" ${fit < 1 ? 'disabled' : ''}>Max</button></div></div>`;
      }).join('');
      // Dirty Cash moves the same way, between places that can hold it (pockets, trunks, safehouses, warehouse vaults)
      const ca = Money.keyOf(A), cb = Money.keyOf(B), cash = Money.cashAt(A);
      if (ca && cb) h += `<div class="xrow"><div class="xh"><span><b style="color:var(--money)">$</b> <b>Dirty Cash</b> · ${fmtMoney(cash)}</span><small>${esc(B.name)} has ${fmtMoney(Money.cashAt(B))}${cb === 'me' ? ' · cash on you is seized if you are arrested' : ''}</small></div>
          <div class="xq">${[1e3, 1e4, 1e5].map(n => `<button class="sbtn" data-act="xc:${n}" ${cash < n ? 'disabled' : ''}>${fmtMoney(n)}</button>`).join('')}<button class="sbtn gold" data-act="xc:-1" ${cash > 0 ? '' : 'disabled'}>All</button></div></div>`;
      else if (cash > 0 || Money.cashAt(B) > 0) h += `<div class="hint">Dirty Cash can be kept on you, in a car, at a safehouse or in a warehouse vault, not at ${esc(ca ? B.name : A.name)}.</div>`;
    }
    // ---- the ledger: every location you own goods in
    h += '<h3>Everything you own</h3>';
    for (const cls of LOC_ORDER) {
      const list = locs.filter(L => L.cls === cls);
      h += `<h3 style="font-size:12px;opacity:.85">${cls}</h3>`;
      if (!list.length) { h += `<div class="hint">${cls === 'VEHICLE' ? 'No car with you. Stand near your car (or sit in it) to use its trunk.' : cls === 'ON PERSON' ? '' : cls === 'WAREHOUSE' ? 'No warehouse yet: the biggest storage in the game (600-900 space). For sale on the Property app.' : 'None owned.'}</div>`; continue; }
      h += '<div class="grid2">' + list.map(L => {
        const rows = holdings(L.o, L.zone, M); let v = 0, c = 0; for (const r of rows) { v += r.value; c += r.cost; }
        tv += v; tc += c;
        const used = L.lb ? cargoC(L.o) : units(L.o), cap = L.lb ? L.capC : L.cap;
        const body = rows.length ? rows.map(r => `<div class="stat"><span><b style="color:${TIERS[GOODS[r.k].tier].col}">■</b> ${GOODS[r.k].name} · ${fmtQty(r.k, r.n)}</span><span>${fmtMoney(r.value)}</span></div><div class="stat" style="font-size:11px"><span>bought @ ${r.cost ? fmtPerUnit(r.k, r.avg) : 'free'} · now ${fmtPerUnit(r.k, r.lot)}</span><span style="color:${r.pl >= 0 ? 'var(--green)' : 'var(--red)'}">${r.pl >= 0 ? '+' : '−'}${fmtMoney(Math.abs(r.pl))}</span></div>`).join('') : '<div class="d">empty</div>';
        return `<div class="card ${L.here ? 'reach' : 'remote'}" data-loc="${esc(L.key)}"><div class="t">${esc(L.name)} ${L.here ? '<span class="chip" style="--c:#46d4c4">IN REACH</span>' : '<span class="chip" style="--c:#8a93a3">REMOTE</span>'}</div><div class="d">${esc(ZONES[L.zone] ? ZONES[L.zone].name : '')} prices${L.here ? '' : ' · read-only: send a runner to move it'}</div>${body}${Money.cashAt(L) > 0 ? `<div class="stat"><span><b style="color:var(--money)">$</b> Dirty Cash</span><span class="money">${fmtMoney(Money.cashAt(L))}</span></div>` : ''}<div class="stat"><span>${L.lb ? 'Cargo' : 'Space'}</span><span>${spaceTxt(L)}</span></div>${this.bar(used, Math.max(1, cap))}</div>`;
      }).join('') + '</div>';
    }
    const runs = S.runs.reduce((a, r) => a + r.cost, 0);
    const head = `<div class="grid4"><div class="tile"><small>Product value now</small><b class="money">${fmtMoney(tv)}</b><span>at local street prices</span></div><div class="tile"><small>Cost basis</small><b>${fmtMoney(tc)}</b><span>what you paid</span></div><div class="tile"><small>Unrealised P/L</small><b style="color:${tv - tc >= 0 ? 'var(--green)' : 'var(--red)'}">${tv - tc >= 0 ? '+' : '−'}${fmtMoney(Math.abs(tv - tc))}</b></div><div class="tile"><small>Realised P/L (all time)</small><b style="color:${(S.st.realized || 0) >= 0 ? 'var(--green)' : 'var(--red)'}">${(S.st.realized || 0) >= 0 ? '+' : '−'}${fmtMoney(Math.abs(S.st.realized || 0))}</b>${S.runs.length ? `<span>${S.runs.length} run(s) in transit (cost ${fmtMoney(runs)})</span>` : ''}</div></div>`;
    return head + h + '<div class="hint">Moves happen by hand, only between places within reach. Prices move; quantities and what you paid never do. Carried product adds to your sentence if you’re arrested.</div>';
  }
  t_loadout() {
    const uw = this.uw;
    return `<div class="hint">One of each gun: it is either on you or in a stash at one of your properties. Move guns, rounds and vests at the property itself; equip and unequip from anywhere.</div>${uw.armory.loadoutHTML(null)}<h3>Stashes</h3>${uw.armory.stashesHTML()}`;
  }
  // DELIVERIES: pick a pickup stash, a destination, the product and amount, then a runner
  t_runs() {
    const uw = this.uw, S = uw.S, g = this.g, R = uw.runs;
    const d = this.runDraft || (this.runDraft = { from: '', to: '', good: '', n: 0, crew: 0 });
    const stashes = uw.props.ownedList().filter(p => p.storage);
    // pickups: you, your stashes and the suppliers who deal with you (a supply run buys there, from the vault);
    // destinations: your stashes and the corners of turfs where you have Dealers (§8)
    const spots = SPOTS.filter(sp => sp.sells && sp.sells.length && (g.save.rep >= (sp.rep || 0) || (S.flags.intro && S.flags.intro[sp.id])));
    const supplyOf = id => { const sp = SPOTS.find(x => 'spot:' + x.id === id); const st = S.supply[sp.id] || {}; const o = {}; for (const k of sp.sells) o[k] = st[k] !== undefined ? st[k] : 0; return o; };
    const imp = uw.shipments.importOpen();
    const origins = [['inv', 'Your pockets (the Driver meets you)'], ...stashes.map(p => ['' + p.id, p.name]), ...spots.map(sp => ['spot:' + sp.id, `${sp.name} (buy there)`]), ...(imp && imp.state === 'landed' ? [['import:' + imp.id, `Your import on the quay (${uw.shipments.importPoint().name})`]] : [])].filter(([id]) => id.startsWith('spot:') ? units(supplyOf(id)) > 0 : units(R.container(id)) > 0);
    if (!origins.some(o => o[0] === d.from)) d.from = origins.length ? origins[0][0] : '';
    const corners = uw.T.filter(t => uw.whse.dealersOn(t.i).length).map(t => ({ id: 'turf:' + t.i, name: `Dealer’s corner · ${t.name}` }));
    // an import only goes to a warehouse (§8: it becomes warehouse stock once it is brought in)
    const dests = [...stashes.map(p => ({ id: p.id, name: p.name })), ...corners].filter(p => p.id !== d.from && (!R.isImport(d.from) || (PROP_BY_ID[p.id] && PROP_BY_ID[p.id].kind === 'warehouse')));
    if (!dests.some(p => p.id === d.to)) d.to = dests.length ? dests[0].id : '';
    const src = d.from ? (d.from.startsWith('spot:') ? supplyOf(d.from) : R.container(d.from)) : {};
    const goods = GOOD_IDS.filter(k => Inv.has(src, k) > 0 && !(d.to && d.to.startsWith('turf:') && (GOODS[k].fence || GOODS[k].arms)));
    if (!goods.includes(d.good)) d.good = goods[0] || '';
    const have = d.good ? Inv.has(src, d.good) : 0;
    const amounts = d.good ? [...new Set([lotsFor(d.good, 1), lotsFor(d.good, 2), lotsFor(d.good, 5), lotsFor(d.good, 10), have].filter(n => n > 0 && n <= have))].sort((a, b) => a - b) : [];
    if (!amounts.includes(d.n)) d.n = amounts.length ? amounts[amounts.length - 1] : 0;
    const crew = R.available();
    if (!crew.some(c => c.id === d.crew)) d.crew = crew.length ? crew[0].id : 0;
    const sel = (key, opts, cur) => `<select data-sel="run:${key}">${opts.map(([v, t]) => `<option value="${esc(v)}" ${String(v) === String(cur) ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select>`;
    let h = `<div class="hint">A Driver carries product between your places, from a supplier to a warehouse, or to a Dealer’s corner, while you do something else. Drivers are on the payroll, so a run has no fee of its own; product bought at a supplier comes out of Dirty Cash, the warehouse’s vault first; the chance of a clean run depends on who you send and who holds the streets in between. A warehouse’s Lieutenant keeps its Dealers’ corners stocked by itself.</div>`;
    if (!stashes.length || crew.length + S.runs.length === 0) h += `<div class="hint">You need ${!stashes.length ? 'at least one property with a stash' : ''}${!stashes.length && !uw.crew.active().some(c => c.role === 'driver') ? ' and ' : ''}${!uw.crew.active().some(c => c.role === 'driver') ? 'a Driver (Crew tab: a crew member with the Driver role, based at a warehouse)' : ''}.</div>`;
    else {
      const a = d.crew && d.from && d.to && d.good && d.n ? R.assess(uw.crew.find(d.crew), d.from, d.to, d.good, d.n) : null;
      const room = d.to ? R.freeAt(d.to) : 0;
      h += `<div class="card"><div class="t">New delivery</div>
        <div class="stat"><span>Pickup</span></div>${origins.length ? sel('from', origins, d.from) : '<div class="d">No stash has product in it.</div>'}
        <div class="stat"><span>Destination</span><span>${d.to ? `${room} space free` : ''}</span></div>${dests.length ? sel('to', dests.map(p => [p.id, p.name]), d.to) : '<div class="d">You need a second property with a stash, or a Dealer on a turf.</div>'}
        <div class="stat"><span>Product</span></div>${goods.length ? sel('good', goods.map(k => [k, `${GOODS[k].name} · ${fmtQty(k, Inv.has(src, k))} there`]), d.good) : '<div class="d">—</div>'}
        <div class="stat"><span>Quantity</span></div>${amounts.length ? sel('n', amounts.map(n => [n, fmtQty(d.good, n) + (n === have ? ' (all)' : '')]), d.n) : '<div class="d">—</div>'}
        <div class="stat"><span>Driver</span></div>${crew.length ? sel('crew', crew.map(c => [c.id, `${uw.crew.displayName(c)} · ${R.band(c)[1]} · skill ${Math.round(c.skill)} · loyalty ${Math.round(c.loyalty)}`]), d.crew) : '<div class="d">No Driver free.</div>'}
        ${a ? `<div class="stat"><span>Chance of a clean run</span><span style="color:${a.p > 0.8 ? 'var(--green)' : a.p > 0.65 ? 'var(--amber)' : 'var(--red)'}">${Math.round(a.p * 100)}%</span></div><div class="d" style="font-size:11px">${a.why.map(([t, v], i) => i ? `${esc(t)} ${v >= 0 ? '+' : '−'}${Math.abs(Math.round(v * 100))}%` : `${esc(t)} ${Math.round(v * 100)}%`).join(' · ')}</div>
        <div class="stat"><span>Cargo value</span><span>${fmtMoney(a.value)}</span></div>${d.from.startsWith('spot:') ? `<div class="stat"><span>Product (from the vault)</span><span class="money">${fmtMoney(Math.round(uw.market.wholesale(uw.loc('spot', d.from.slice(5)).zone, d.good) * d.n))}</span></div>` : ''}<div class="stat"><span>Time on the road</span><span>about ${a.hours} h</span></div>` : ''}
        <div class="btns"><button class="sbtn gold" data-act="rungo" ${a && Money.payrollReserve() >= (d.from.startsWith('spot:') ? Math.round(uw.market.wholesale(uw.loc('spot', d.from.slice(5)).zone, d.good) * d.n) : 0) && room >= d.n * GOODS[d.good].size ? '' : 'disabled'}>${a ? `Send ${esc(uw.crew.find(d.crew).name.split(' ')[0])}` : 'Send'}</button></div></div>`;
    }
    h += this.importsHTML();
    const now = R.absHour();
    h += `<h3>On the road <small>${S.runs.length}</small></h3>` + (S.runs.length ? '<div class="jobs">' + S.runs.map(r => `<div class="job"><i>⇢</i><div><b>${esc(r.name)} · ${fmtQty(r.good, r.n)} ${GOODS[r.good].name}</b><span>${esc(r.from === 'inv' ? 'from you' : R.placeName(r.from))} → ${esc(R.placeName(r.to))} · ${Math.round(r.chance * 100)}% · arrives in ~${Math.max(0, r.eta - now)}h · fee ${fmtMoney(r.fee)}</span></div></div>`).join('') + '</div>' : '<div class="hint">No runs out right now.</div>');
    h += `<h3>Reports</h3>` + (S.runLog.length ? '<div class="msgs">' + S.runLog.slice().reverse().map(r => { const [t, col] = r.outcome === 'success' ? ['SUCCESS', '#7fe08f'] : r.outcome === 'partial' ? ['PARTIAL LOSS', '#ffd84d'] : [RUN_OUTCOMES[r.outcome] || r.outcome, '#ff8a3d']; return `<div class="msg"><i style="background:${col}">${r.outcome === 'success' ? '✓' : '!'}</i><div><b>${t} · ${esc(r.name)}</b><small>day ${r.day}</small><p>${esc(r.from)} → ${esc(r.to)} · ${fmtQty(r.good, r.n)} ${GOODS[r.good].name} · delivered ${fmtQty(r.good, r.delivered)}${r.lost ? ' · lost ' + fmtQty(r.good, r.lost) : ''}${r.returned ? ' · returned ' + fmtQty(r.good, r.returned) : ''} · fee ${fmtMoney(r.fee)}${r.text ? '<br>' + esc(r.text) : ''}</p></div></div>`; }).join('') + '</div>' : '<div class="hint">No runs finished yet.</div>');
    return h;
  }
  // IMPORTS (§3, §8): a bulk load at about half the wholesale price, landing at the docks; rank-gated
  importsHTML() {
    const uw = this.uw, Sh = uw.shipments, imp = Sh.importOpen(), P = Sh.importPoint();
    let h = `<h3>Imports</h3><div class="hint">A whole load at about ${Math.round(IMPORT.price * 100)}% of the supplier’s price, paid up front from a vault. It lands at ${esc(P.name)} and the port holds it for a day: it becomes warehouse stock only when a Driver brings it in (a delivery from the quay) or you load it into a van or box truck and unload it at a warehouse. Customs open a container now and then.</div>`;
    if (imp) {
      const st = imp.state === 'due' ? `at sea · lands in ~${Sh.hoursTo(imp.at)}h` : `on the quay · ${Sh.hoursTo(imp.until)}h before the port impounds it`;
      return h + `<div class="card"><div class="t">${esc(goodsList(imp.cargo))}</div><div class="d">${st}</div><div class="stat"><span>Paid</span><span class="money">${fmtMoney(imp.paid)}</span></div></div>`;
    }
    h += '<div class="jobs">' + Object.keys(IMPORT.lots).map(k => {
      const why = Sh.importBlock(k), price = Sh.importPrice(k);
      return `<div class="job${why ? ' locked' : ''}"><i>⚓</i><div><b>${fmtQty(k, IMPORT.lots[k])} ${GOODS[k].name} · ${fmtMoney(price)}</b><span>${esc(why || 'Lands in 8–16 hours.')}</span></div><button class="sbtn" data-act="import:${k}" ${why ? 'disabled' : ''}>Order</button></div>`;
    }).join('') + '</div>';
    return h;
  }
  t_factions() {
    const uw = this.uw, S = uw.S;
    return '<div class="grid2">' + FAC_IDS.map(id => {
      const F = FACTIONS[id], f = S.factions[id], att = uw.attitude(id), n = uw.factionTurfs(id), L = uw.loc('hq', id);
      const status = f.broken ? 'BROKEN' : f.bossDown > 0 ? 'LEADERLESS' : f.truce > S.day ? (f.tribute ? 'PAYS YOU TRIBUTE' : 'TRUCE ' + (f.truce - S.day) + 'd') : S.turfs.some(t => t.war && (t.war.a === id || t.war.d === id)) ? 'AT WAR' : '';
      return `<div class="card" style="border-left:3px solid ${F.col}"><div class="t">${esc(F.name)} ${status ? `<span class="chip" style="--c:${F.col}">${status}</span>` : ''}</div><div class="d">${esc(F.archetype)} · ${f.broken ? '—' : esc(f.boss)}${f.bossDown > 0 && !f.broken ? ' (succession)' : ''}<br>${esc(F.blurb)}</div>
        <div class="stat"><span>Strength</span><span>${Math.round(f.strength)}</span></div>${this.bar(f.strength, 110, F.col)}
        ${f.broken ? '' : `<div class="stat"><span>Right now</span><span style="color:${(f.aggro || 0) >= GANG_AGGRO.squad ? 'var(--red)' : (f.aggro || 0) >= GANG_AGGRO.hot ? 'var(--amber)' : 'inherit'}">${(f.aggro || 0) >= GANG_AGGRO.squad ? 'hunting for you' : (f.aggro || 0) >= GANG_AGGRO.hot ? 'on the lookout' : (f.aggro || 0) > 0.5 ? 'cooling off' : 'not looking for you'}</span></div>`}
        <div class="stat"><span>Turfs</span><span>${n}</span></div>
        <div class="stat"><span>Wealth</span><span>${f.money > 80000 ? 'Rich' : f.money > 20000 ? 'Comfortable' : f.money > 5000 ? 'Tight' : 'Broke'}</span></div>
        <div class="stat"><span>Toward you</span><span>${att} (${Math.round(f.rel)})</span></div>${this.bar(f.rel + 100, 200, f.rel < -30 ? '#ff4d5e' : f.rel > 30 ? '#7fe08f' : '#ffb547')}
        <div class="stat"><span>Deals in</span><span>${F.goods.map(k => GOODS[k].name).join(', ')}</span></div>
        <div class="btns">${!f.broken ? this.wpBtn(L.x, L.z, F.short + ' HQ') : ''}</div></div>`;
    }).join('') + '</div>';
  }
  t_police() {
    const uw = this.uw, S = uw.S, g = this.g, CS = uw.cops;
    const p = g.player, i = turfAt(p.pos.x, p.pos.z);
    let h = `<div class="grid4"><div class="tile"><small>Police pressure</small><b>${Math.round(S.pressure)}</b>${this.bar(S.pressure, 100, S.pressure > 66 ? '#ff4d5e' : '#ffb547')}</div>
      <div class="tile"><small>Local presence here</small><b>${Math.round(S.turfs[i].police)}</b><span>${esc(uw.T[i].name)}</span></div>
      <div class="tile"><small>Task force</small><b>${S.taskforce > 0 ? S.taskforce + ' days' : 'none'}</b></div>
      <div class="tile"><small>Crackdown</small><b>${S.crackdown > 0 ? S.crackdown + ' days' : 'none'}</b></div></div>
      <div class="hint">Pressure is your long-term heat: more patrols, sharper eyes, raids on your stashes and longer sentences. It rises with witnessed crimes, wanted levels, dealing and gang war, and falls with time, lying low, front businesses and friends on the force.</div>
      <div class="stats"><span>Prior convictions</span><span>${S.rap.priors}</span><span>Officers assaulted</span><span>${S.rap.cops}</span><span>Police cars destroyed</span><span>${S.rap.copcars}</span><span>Sentence multiplier now</span><span>×${(uw.cops.sentenceMul() * (1 + S.rap.priors * 0.12)).toFixed(2)}</span></div>
      ${uw.legal.caseHtml()}
      <h3>People on the force</h3><div class="grid2">`;
    for (const O of OFFICERS) {
      const c = S.cops[O.id], can = CS.canApproach(O);
      const st = c ? (c.st === 'paid' ? `ON PAYROLL · next ${fmtMoney(O.fee)} in ${Math.max(0, c.due - S.day)}d` : c.st === 'refused' ? 'REFUSED' : 'BURNED') : can ? '' : 'needs ' + RANKS[O.minRank].name;
      h += `<div class="card${can ? '' : ' locked'}"><div class="t">${esc(O.name)}</div><div class="d">${esc(O.rank)}<br>${esc(O.perks)}</div><div class="stat"><span>${esc(st)}</span><span>${fmtMoney(O.fee)}/week</span></div>
        ${c && c.st === 'paid' ? `<button class="sbtn" data-act="cdrop:${O.id}">Stop paying</button>` : !c ? `<button class="sbtn gold" data-act="cbribe:${O.id}" ${!can || !Money.can(O.fee, 'bribe') ? 'disabled' : ''}>Approach</button>` : ''}</div>`;
    }
    h += '</div>';
    if (CS.perk('pike')) h += `<h3>Point a raid (Lt. Pike)</h3><div class="btns">${FAC_IDS.filter(f => !S.factions[f].broken).map(f => `<button class="sbtn" data-act="redir:${f}" ${S.pikeCD > 0 ? 'disabled' : ''}>${FACTIONS[f].short}</button>`).join('')}</div><div class="hint">${S.pikeCD > 0 ? `Available again in ${S.pikeCD} day(s).` : 'A raid wrecks their stock and turf grip and makes their product scarce. Be holding when it lands.'}</div>`;
    return h;
  }
  t_feed() {
    const uw = this.uw, S = uw.S, g = this.g, now = uw.opps.absHour();
    const list = uw.opps.active().slice().reverse();
    let h = uw.threats.feedHTML(esc) + '<h3>Opportunities</h3>';
    if (!list.length) h += '<div class="hint">Nothing on the wire right now. Things change hour by hour.</div>';
    h += '<div class="msgs">' + list.map(o => `<div class="msg"><i style="background:${o.urgent ? '#ff4d5e' : '#d28cff'}">${OPP_ICON[o.kind] || '•'}</i><div><b>${esc(o.title)}</b><small>${Math.max(1, o.until - now)}h left</small><p>${esc(o.text)}</p>${o.x !== undefined && !o.taken ? this.wpBtn(o.x, o.z, o.title) : ''}</div></div>`).join('') + '</div>';
    h += '<h3>Messages</h3><div class="msgs">' + S.decisions.map(d => `<div class="msg"><i style="background:#ffd84d">?</i><div><b>${esc(d.text)}</b><div class="btns"><button class="sbtn gold" data-act="dec:${d.id}:1">Agree</button><button class="sbtn" data-act="dec:${d.id}:0">Refuse</button></div></div></div>`).join('') +
      g.save.messages.slice(-25).reverse().map(m => `<div class="msg"><i style="background:${CONTACT_AVATAR[m.from] || '#8a8f96'}">${esc((CONTACT_NAMES[m.from] || m.from).replace(/[^A-Za-z]/g, '').charAt(0) || '?')}</i><div><b>${esc(CONTACT_NAMES[m.from] || m.from)}</b><small>${esc(m.day || '')}</small><p>${esc(m.text)}</p></div></div>`).join('') + '</div>';
    return h;
  }
  // ---------------------------------------------------------------- empire actions
  act(a, el) {
    const uw = this.uw, g = this.g, S = uw.S;
    const [k, x, y, z, w] = a.split(':');
    let r = '';
    if (k === 'app') { this.openApp(x); return; }
    if (this.locked()) return;
    switch (k) {
      case 'threat': { if (uw.threats.openThreat(+x)) { g.ui.closeAll(); return; } r = 'That threat is over.'; break; }
      case 'wp': { const label = decodeURIComponent(z || 'Waypoint'), key = decodeURIComponent(w || ''); g.content.setWaypoint(+x, +y, label); if (key) g.content.waypoint.key = key; r = `Waypoint set: ${label}. Follow the arrow or the GPS line.`; break; }
      case 'pk': this.pnlSel = this.pnlSel === x ? null : x; this.render(); return;
      case 'xf': { const X = this.xfer || (this.xfer = { from: 'inv', to: '' }), key = (y || '').replace(/~/g, ':'); if (x === 'swap') { const t = X.from; X.from = X.to || t; X.to = t; } else if (x === 'from') { if (X.to === key) X.to = X.from; X.from = key; } else if (x === 'to') X.to = key; this.render(); return; }
      case 'xc': { const X = this.xfer || {}, moved = uw.transferCash(X.from, X.to, +x); const dst = uw.locations().find(L => L.key === X.to); r = moved ? `Moved ${fmtMoney(moved)} in cash to ${dst ? dst.name : 'there'}.` : 'Nothing moved.'; break; }
      case 'xm': { const X = this.xfer || {}, n = +y, src = uw.locations().find(L => L.key === X.from && L.here); if (!GOODS[x] || !src) break; const moved = uw.transfer(X.from, X.to, x, n < 0 ? Inv.has(src.o, x) : n); const dst = uw.locations().find(L => L.key === X.to); r = moved ? `Moved ${fmtQty(x, moved)} ${GOODS[x].name} to ${dst ? dst.name : 'there'}.` : 'No room there.'; break; }
      case 'cc': if (x === 'good' || x === 'role') this.cc[x] = y; this.render(); return;
      case 'pf': if (this.pf && x in this.pf) { this.pf[x] = y; this.render(); } return;
      case 'bf': if (this.bf && x in this.bf) { this.bf[x] = y; this.render(); } return;
      case 'bup': { r = uw.props.upgrade(x); if (!r) { const d = PROP_BY_ID[x]; r = `${d.name}: level ${uw.props.level(x)}.`; } break; }
      case 'take': r = uw.takeTurf(+x) || (uw.owner[+x] === 'pc' ? `${uw.T[+x].name} is yours.` : `Showdown called for ${uw.T[+x].name}.`); break;
      case 'hire': r = uw.crew.hire(+x); break;
      case 'promo': r = uw.crew.promote(+x); break;
      case 'bonus': r = uw.crew.bonus(+x); break;
      case 'disc': uw.crew.discipline(+x); r = 'They got the message. So did everyone watching.'; break;
      case 'fire': { const c = uw.crew.find(+x); g.ui.ask(`Let ${c ? c.name : 'them'} go?`, 'They leave the crew for good. Unhappy senior people may talk.', 'Let go', () => { uw.crew.fire(+x); this.render(); }); return; }
      case 'role': { const c = uw.crew.find(+x); if (!c) break; const R = CREW_ROLES[y], wh0 = uw.whse.list()[0]; const tgt = y === 'driver' ? (wh0 ? 'w:' + wh0.id : null) : R.turf ? (typeof c.assign === 'number' ? c.assign : turfAt(g.player.pos.x, g.player.pos.z)) : R.zone ? (ZONES[c.assign] ? c.assign : zoneKey(g.player.pos.x, g.player.pos.z)) : R.biz ? ((uw.props.ownedList().find(p => p.kind === 'business') || {}).id) : null; r = uw.crew.assign(+x, y, tgt); break; }
      case 'tgt': { const c = uw.crew.find(+x); if (!c) break; const R = CREW_ROLES[c.role], v = a.split(':').slice(2).join(':'); r = uw.crew.assign(+x, c.role, v.startsWith('w:') ? v : R.turf ? +v : v); break; }
      case 'from': { const c = uw.crew.find(+x); if (c && c.role === 'dealer' && PROP_BY_ID[y] && PROP_BY_ID[y].kind === 'warehouse' && uw.props.owned(y)) { c.from = y; r = `${c.name.split(' ')[0]}’s corner is supplied from ${PROP_BY_ID[y].name}.`; } break; }
      case 'repair': r = uw.props.repair(x); break;
      case 'dec': uw.crew.decide(+x, y === '1'); break;
      case 'cbribe': r = uw.cops.approach(x); break;
      case 'quash': r = uw.legal.quash(); break;
      case 'cdrop': uw.cops.drop(x); r = 'You stopped paying. They won’t miss you.'; break;
      case 'redir': r = uw.cops.redirect(x); if (!r) r = 'Pike is on it.'; break;
      case 'run': { const d = this.runDraft || (this.runDraft = {}); d[x] = x === 'n' || x === 'crew' ? +y : y; this.render(); return; }
      case 'import': { r = uw.shipments.orderImport(x) || 'Ordered. Watch the docks.'; break; }
      case 'rungo': { const d = this.runDraft || {}; r = uw.runs.dispatch(d.crew, d.from, d.to, d.good, d.n) || `${uw.crew.find(d.crew) ? uw.crew.find(d.crew).name.split(' ')[0] : 'The runner'} is on the way.`; break; }
      default: { const ar = uw.armory.act(a, null); if (ar !== null) r = ar; }
    }
    this.msg = r || '';
    g.saveGame();
    this.render();
  }
  // ---------------------------------------------------------------- street menus (generic service screen)
  openProp(id) {
    const uw = this.uw, g = this.g, S = uw.S, PM = uw.props, d = PROP_BY_ID[id];
    const render = () => {
      if (!PM.owned(id)) {
        const z0 = uw.loc('prop', id).zone, H0 = d.kind === 'safehouse' ? HOOD[z0] : null, C0 = d.cat ? BIZ_CATS[d.cat] : null;
        const extra = (d.kind === 'safehouse' ? `<div class="stats">${d.finish ? `<span>Finish</span><span>${d.finish}</span>` : ''}${d.sec ? `<span>Security</span><span>${'■'.repeat(d.sec)}${'□'.repeat(5 - d.sec)}</span>` : ''}${d.crew ? `<span>Crew room</span><span>${d.crew}</span>` : ''}${d.infl ? `<span>Prestige</span><span>+${d.infl} influence</span>` : ''}${H0 ? `<span>${esc(H0.name)}</span><span>${esc(H0.perk)}</span>` : ''}${d.sig ? '<span>Signature home</span><span>the finest house in the neighbourhood</span>' : ''}</div>` : '')
          + (C0 ? `<div class="stats"><span>Category</span><span>${C0.icon} ${C0.name}</span><span>Income</span><span>about ${fmtMoney(PM.bizPreview(d).net)}/day after costs</span><span>Benefit</span><span>${esc(C0.benefit(C0.lv[0]))}</span><span>Upgrades</span><span>to level 2 ${fmtMoney(bizUpgradeCost(d, 1))} · to level 3 ${fmtMoney(bizUpgradeCost(d, 2))}</span></div>` : '');
        return `<div class="svcTop"><span>${d.kind.toUpperCase()}</span><span>${esc(ZONES[z0].name)}</span><span>${Money.html('property')}</span></div>${extra}
          <div class="hint">${esc(d.desc)}</div><div class="stats">${d.storage ? `<span>Storage</span><span>${d.storage} units</span>` : ''}${PM.capOf(d) ? `<span>Parking</span><span>${esc(PM.parkingText(d))}</span>` : ''}${d.tier ? `<span>Tier</span><span>${d.tier} of 6 · ${esc(d.type || '')}</span>` : ''}${d.crew ? `<span>Room for crew</span><span>+${d.crew}</span>` : ''}${d.income ? `<span>Income</span><span>~${fmtMoney(d.income)} / day</span>` : ''}${d.kind === 'safehouse' ? '<span>Safehouse</span><span>save, rest, wardrobe</span>' : ''}${d.launder ? `<span>Front</span><span>washes up to ${fmtMoney(FRONT.cap[0])} of Dirty Cash a day at ${Math.round(FRONT.fee[0] * 100)}% (more at higher levels); cools police pressure</span>` : ''}${d.fence ? '<span>Fence</span><span>better prices on hot goods</span>' : ''}${d.recruit ? '<span>Recruiting</span><span>better candidates</span>' : ''}</div>
          <div class="actions" style="justify-content:flex-start"><button class="sbtn gold" data-act="buy" ${!Money.can(PM.price(d), 'property') ? 'disabled' : ''}>Buy · ${fmtMoney(PM.price(d))}</button>${d.home ? '<button class="sbtn" data-act="view">Look inside</button><button class="sbtn danger" data-act="breakin">Break in</button>' : ''}${d.fence ? '<button class="sbtn" data-act="fence">Sell to Lucky (fence)</button>' : ''}</div>`;
      }
      const o = S.props[id];
      let h = `<div class="svcTop"><span>${d.kind.toUpperCase()} · yours</span>${PM.storageCap(id) ? `<span>Storage <b>${units(S.storage[id])} / ${PM.storageCap(id)}</b></span>` : ''}<span>${Money.html('property')}</span></div>`;
      if (d.kind === 'business' && d.cat) h += this.bizCard(d, true);
      h += uw.fronts.html(id);
      h += uw.tools.stashHTML(id);
      h += '<div class="btns">';
      if (d.kind === 'safehouse') h += `<button class="sbtn gold" data-act="save">Save game</button><button class="sbtn" data-act="sleep">Sleep / lie low</button><button class="sbtn" data-act="wardrobe">Wardrobe</button>`;
      if (PM.capOf(d)) h += `<button class="sbtn" data-act="garage">Parking · ${PM.capOf(d)}</button>`;
      if (d.fence) h += `<button class="sbtn" data-act="fence">Fence goods</button>`;
      if (d.recruit || d.kind === 'safehouse' || d.kind === 'business') h += `<button class="sbtn" data-act="crew">Crew & empire</button>`;
      if (d.respray || id === 'qgarage') h += `<button class="sbtn" data-act="respray">Respray car · ${fmtMoney(Math.round(300 * (1 - uw.props.perk('respray')) / 10) * 10)}</button><button class="sbtn" data-act="carfix">Repair car</button>`;
      if (o.dmg) h += `<button class="sbtn gold" data-act="repair">Repair damage · ${fmtMoney(PM.repairCost(d))}</button>`;
      h += '</div>';
      if (d.kind === 'warehouse') h += this.whPanel(id);
      else if (PM.storageCap(id)) h += this.stashTable(id);
      return h;
    };
    g.content.openSvc(d.name, PM.owned(id) ? 'Your property.' : 'For sale.', render, a => this.propAct(id, a));
  }
  // a warehouse you own (§7): Product, Weapons/Ammo, Dirty Cash, Security, Crew, Logistics
  // a rival's stock, from inside their building or their loading bay: the transfer screen, from their shelves
  openRivalStock(fid) { this.xfer = { from: 'rival:' + fid, to: '' }; this.open('stash'); }
  whPanel(id) {
    const uw = this.uw, W = uw.whse, S = uw.S, d = PROP_BY_ID[id], tab = this.whTab || 'product';
    const tabs = [['product', 'Product'], ['weapons', 'Weapons'], ['cash', 'Dirty Cash'], ['security', 'Security'], ['crew', 'Crew'], ['logistics', 'Logistics']];
    let h = `<div class="stats"><span>Security</span><span>Level ${W.level(id)} · ${esc(W.levelName(id))}${W.immune(id) ? ' · <b style="color:var(--green)">ordinary raids can’t touch it</b>' : ''}</span><span>Crew</span><span>${W.slotsUsed(id)} / ${WH_SLOTS}</span><span>Vault</span><span class="money">${fmtMoney(Money.dirtyAtProp(id))} / ${fmtMoney(W.vaultCap(id))}</span></div>`;
    h += `<div class="btns">${tabs.map(([k, n]) => `<button class="etab${k === tab ? ' on' : ''}" data-act="wt:${k}">${n}</button>`).join('')}</div>`;
    if (tab === 'product') return h + this.stashTable(id, false);
    if (tab === 'weapons') return h + this.uw.armory.stashHTML(id);
    if (tab === 'cash') {
      const here = uw.locations().some(L => L.key === 'p:' + id && L.here), me = Money.onMe, vault = Money.dirtyAtProp(id), room = Money.roomAt('p:' + id), tr = Money.treasury === id;
      h += `<div class="hint">The vault keeps Dirty Cash safe from an ordinary arrest (§2). It holds ${fmtMoney(W.vaultCap(id))} at this vault tier; better vault work holds more. Moving cash in or out needs you here.</div>`;
      h += here ? `<div class="btns">${[1e4, 1e5, 1e6].map(n => `<button class="sbtn" data-act="wcash:in:${n}" ${me < n || room < n ? 'disabled' : ''}>Deposit ${fmtMoney(n)}</button>`).join('')}<button class="sbtn gold" data-act="wcash:in:-1" ${me <= 0 || room <= 0 ? 'disabled' : ''}>Deposit all</button></div><div class="btns">${[1e4, 1e5, 1e6].map(n => `<button class="sbtn" data-act="wcash:out:${n}" ${vault < n ? 'disabled' : ''}>Withdraw ${fmtMoney(n)}</button>`).join('')}<button class="sbtn" data-act="wcash:out:-1" ${vault <= 0 ? 'disabled' : ''}>Withdraw all</button></div>` : '<div class="hint">Come here in person to move cash.</div>';
      h += `<h3>Treasury</h3><div class="hint">${tr ? `${esc(d.name)} is your Treasury Warehouse: income that no operation’s warehouse takes comes here (§45.22).` : 'Make this the Treasury Warehouse: income that no operation’s warehouse takes comes here instead of your home safehouse.'}</div><div class="btns"><button class="sbtn${tr ? '' : ' gold'}" data-act="wtreas">${tr ? 'Stop being the treasury' : 'Make it the treasury'}</button></div>`;
      return h;
    }
    if (tab === 'security') {
      h += '<div class="jobs">' + WH_CAT_IDS.map(k => { const t = W.tier(id, k), C = WH_CATS[k], cost = W.upgradeCost(id, k); return `<div class="job"><i>${'■'.repeat(t)}${'□'.repeat(4 - t)}</i><div><b>${esc(C.name)}</b><span>${esc(C.tiers[t])}${t < 4 ? ` · next: ${esc(C.tiers[t + 1])}` : ''}</span></div><button class="sbtn gold" data-act="wup:${k}" ${t >= 4 || !Money.can(cost, 'property') ? 'disabled' : ''}>${t >= 4 ? 'Done' : fmtMoney(cost)}</button></div>`; }).join('') + '</div>';
      const enf = W.crewAt(id, 'enforcer').length, lt = W.crewAt(id, 'lieutenant').length;
      // what the compound physically has right now (Session 3B): it is what you see on site
      if (uw.compounds.R[id]) {
        const P = uw.compounds.status(id), pct = f => Math.round(f * 100) + '%';
        const FN = { none: 'open lot', chain: 'chain-link fence', tall: 'tall fence behind bollards', anticlimb: 'anti-climb fence behind anti-ram barriers', wall: 'hardened wall and fence' };
        const GN = { none: 'an open gap', basic: 'a basic gate', motor: 'a motorised gate', reinforced: 'a reinforced gate and guard booth', massive: 'a massive gate, wedge barrier, access posts and booth' };
        h += `<h3>On site</h3><div class="stats"><span>Perimeter</span><span>${FN[P.fence]}</span><span>Way in</span><span>${GN[P.gate]}</span><span>Cameras</span><span>${P.cams ? `${P.cams} · cover ${pct(P.day)} of the yard by day, ${pct(P.night)} at night` : 'none'}</span><span>Lights</span><span>${P.lights} fixture${P.lights === 1 ? '' : 's'}</span>${P.breaches || P.patched ? `<span>Damage</span><span style="color:var(--red)">${P.breaches ? `${P.breaches} breach${P.breaches === 1 ? '' : 'es'} open` : ''}${P.breaches && P.patched ? ' · ' : ''}${P.patched ? `${P.patched} patched (weak)` : ''}</span>` : ''}</div>`;
        if (P.breaches || P.patched) {
          const crewHere = uw.crew.active().some(c => c.assign === 'w:' + id);
          h += `<div class="hint">${crewHere ? `Your crew here patch a breach within ${WH_BREACH.patchH} hour and repair it fully after ${WH_BREACH.repairH}, paid from the vault.` : 'Nobody works here: it stays open until you patch it on site or pay contractors.'}</div><div class="btns">${P.breaches ? '<button class="sbtn" data-act="wpatch">Patch it yourself (on site)</button>' : ''}<button class="sbtn gold" data-act="wfix">Contractors · repair everything today</button></div>`;
        }
      }
      h += `<div class="hint">The security level is set by the weakest of the four. At ${WH_LEVEL_NAME[4]} with at least ${WH_IMMUNE.enforcers} Enforcers and a Lieutenant on site, ordinary rival raids can’t knock it off (now: level ${W.level(id)}, ${enf} Enforcer${enf === 1 ? '' : 's'}, ${lt ? 'a Lieutenant' : 'no Lieutenant'}). A gang-war assault, the police, betrayal or sabotage are another matter. Defense ${Math.round(W.defense(id))}.</div>`;
      return h;
    }
    if (tab === 'crew') {
      const here = uw.crew.active().filter(c => c.assign === 'w:' + id), idle = uw.crew.active().filter(c => c.role === 'idle');
      h += here.length ? '<div class="jobs">' + here.map(c => `<div class="job"><i>●</i><div><b>${esc(uw.crew.displayName(c))}</b><span>${CREW_ROLES[c.role].name} · skill ${Math.round(c.skill)} · loyalty ${Math.round(c.loyalty)}</span></div></div>`).join('') + '</div>' : '<div class="hint">Nobody works here yet.</div>';
      h += `<div class="hint">Up to ${WH_MAX.enforcer} Enforcers guard it, up to ${WH_MAX.driver} Drivers run its logistics and one Lieutenant runs it and its district. ${WH_SLOTS} people at most.</div>`;
      if (idle.length) h += '<h3>Unassigned crew</h3><div class="jobs">' + idle.map(c => `<div class="job"><i>○</i><div><b>${esc(uw.crew.displayName(c))}</b><span>skill ${Math.round(c.skill)} · ${CREW_RANKS[c.rank]}</span></div><div class="btns">${['enforcer', 'driver', 'lieutenant'].map(r => `<button class="sbtn" data-act="wcrew:${c.id}:${r}" ${W.canAssign(c, r, id) || (CREW_ROLES[r].minRank && c.rank < CREW_ROLES[r].minRank) ? 'disabled' : ''}>${CREW_ROLES[r].name}</button>`).join('')}</div></div>`).join('') + '</div>';
      return h;
    }
    // logistics
    const drivers = W.crewAt(id, 'driver'), lt = W.crewAt(id, 'lieutenant')[0], st = W.st(id);
    const dealers = uw.crew.active().filter(c => c.role === 'dealer' && typeof c.assign === 'number' && W.supplierOf(c) === id);
    h += `<div class="stats"><span>Drivers</span><span>${drivers.length ? drivers.map(c => esc(c.name.split(' ')[0]) + (S.runs.some(r => r.crew === c.id) ? ' (out)' : '')).join(', ') : 'none'}</span><span>Lieutenant</span><span>${lt ? esc(lt.name) : 'none'}</span><span>Dealers supplied</span><span>${dealers.length ? dealers.map(c => `${esc(uw.T[c.assign].name)} ${units(W.turfStock(c.assign))}/${TURF_STOCK_CAP}`).join(', ') : 'none'}</span></div>`;
      h += `<div class="hint">${lt ? (st.auto ? `${esc(lt.name.split(' ')[0])} sends free Drivers each day to keep the corners of the Dealers this warehouse supplies at ${TURF_STOCK_TARGET}.` : 'Automatic resupply is off: send runs yourself (Empire → Deliveries).') : 'With a Lieutenant here, free Drivers keep the Dealers’ corners stocked automatically. Until then, send runs yourself (Empire → Deliveries).'}</div><div class="btns"><button class="sbtn" data-act="wauto" ${lt ? '' : 'disabled'}>${st.auto ? 'Turn automatic resupply off' : 'Turn automatic resupply on'}</button></div>`;
    const runs = S.runs.filter(r => r.from === id || r.to === id);
    if (runs.length) h += '<h3>On the road</h3><div class="jobs">' + runs.map(r => `<div class="job"><i>⇢</i><div><b>${esc(r.name)} · ${fmtQty(r.good, r.n)} ${GOODS[r.good].name}</b><span>${esc(uw.runs.placeName(r.from))} → ${esc(uw.runs.placeName(r.to))}</span></div></div>`).join('') + '</div>';
    return h;
  }
  // quantity buttons for a good: 1 / 5 lb and everything (or x1 / x5 / all for pieces)
  qtyBtns(prefix, k, max, label = '') {
    const one = lotsFor(k, 1), five = lotsFor(k, 5);
    const lb = GOOD_UNIT[k][2] < 1;
    const opts = [[lb ? '1 lb' : '×1', one], [lb ? '5 lb' : '×5', five], ['All', -1]];
    return opts.map(([t, n]) => `<button class="sbtn" data-act="${prefix}:${k}:${n}" ${max < 1 ? 'disabled' : ''}>${label}${t}</button>`).join('');
  }
  stashTable(id, armory = true) {
    const uw = this.uw, S = uw.S, v = uw.nearVehicle(), st = S.storage[id] || (S.storage[id] = {}), d = PROP_BY_ID[id];
    const L = uw.loc('prop', id), z = L ? L.zone : 'm';
    const rows = GOOD_IDS.filter(k => Inv.has(S.inv, k) + (v ? Inv.has(v.trunk, k) : 0) + Inv.has(st, k) > 0);
    let h = `<h3>Product stash <small>${esc(LOC_CLASS[d.kind] || 'PROPERTY')} · here ${units(st)}/${uw.props.storageCap(id)} space · pockets ${units(S.inv)}/${POCKET_CAP}${v ? ` · ${esc(v.spec.name)} trunk ${fmtLb(cargoC(v.trunk))} of ${fmtLb(cargoCapC(v.type))}` : ' · no car nearby'}</small></h3>`;
    if (!rows.length) h += '<div class="hint">Nothing to move. Product you buy goes in your pockets, then the trunk of a car parked nearby.</div>';
    else h += '<div class="jobs">' + rows.map(k => {
      const here = Inv.has(st, k), lot = uw.market.price(z, k), val = here * lot, cost = Inv.cost(st, k), pl = val - cost;
      return `<div class="job" style="flex-wrap:wrap"><i style="color:${TIERS[GOODS[k].tier].col}">■</i><div style="min-width:180px"><b>${GOODS[k].name}</b><span>on you ${fmtQty(k, Inv.has(S.inv, k))}${v ? ' · trunk ' + fmtQty(k, Inv.has(v.trunk, k)) : ''} · <b>here ${fmtQty(k, here)}</b>${here ? ` · avg cost ${fmtPerUnit(k, cost / here)} · worth ${fmtPerUnit(k, lot)} here = ${fmtMoney(val)} <b style="color:${pl >= 0 ? 'var(--green)' : 'var(--red)'}">${pl >= 0 ? '+' : '−'}${fmtMoney(Math.abs(pl))}</b>` : ''}</span></div>
        <div class="btns" style="flex-basis:100%">${this.qtyBtns('st', k, Inv.has(S.inv, k) + (v ? Inv.has(v.trunk, k) : 0), 'Store ')}${this.qtyBtns('tk', k, here, 'Take ')}${v ? this.qtyBtns('ld', k, here, 'Load ') : ''}</div></div>`;
    }).join('') + '</div>';
    if (armory) h += this.uw.armory.stashHTML(id);
    return h;
  }
  propAct(id, a) {
    const uw = this.uw, g = this.g, S = uw.S, d = PROP_BY_ID[id];
    const [k, good] = a.split(':');
    let r = '';
    // a front's books (M9): cash through, manager top-ups
    if (k === 'fdep') { const e = uw.fronts.deposit(id, good === 'all' ? Infinity : +good); g.content.refreshSvc(e || 'Through the books. It comes out clean, a day at a time.'); return; }
    if (k === 'fauto') { g.content.refreshSvc(uw.fronts.toggleAuto(id)); g.saveGame(); return; }
    // lockpick sets in the stash (M10)
    if (k === 'tpst' || k === 'tptk') { const e = k === 'tpst' ? uw.tools.store(id, Infinity) : uw.tools.take(id, Infinity); g.saveGame(); g.content.refreshSvc(e || (k === 'tpst' ? 'Put away.' : 'Taken.')); return; }
    // the warehouse panel
    if (d.kind === 'warehouse') {
      const parts = a.split(':');
      if (k === 'wt') { this.whTab = parts[1]; g.content.refreshSvc(); return; }
      if (k === 'wup') { g.content.refreshSvc(uw.whse.upgrade(id, parts[1]) || `${WH_CATS[parts[1]].name}: ${WH_CATS[parts[1]].tiers[uw.whse.tier(id, parts[1])]}.`); return; }
      if (k === 'wtreas') { const on = Money.treasury === id, e = Money.setTreasury(on ? null : id); g.saveGame(); g.content.refreshSvc(e || (on ? 'No Treasury Warehouse: income goes to your home safehouse.' : `${d.name} is now your Treasury Warehouse.`)); return; }
      if (k === 'wpatch') { const e = uw.compounds.patchNow(id); g.content.refreshSvc(e || 'Patched. It will hold against a push, not a ram.'); return; }
      if (k === 'wfix') { const e = uw.compounds.repairNow(id); g.content.refreshSvc(e || 'Repaired: back to what you paid for.'); return; }
      if (k === 'wauto') { const st = uw.whse.st(id); st.auto = !st.auto; g.saveGame(); g.content.refreshSvc(st.auto ? 'Automatic resupply is on.' : 'Automatic resupply is off.'); return; }
      if (k === 'wcash') { const n = +parts[2], m = parts[1] === 'in' ? uw.transferCash('inv', 'p:' + id, n) : uw.transferCash('p:' + id, 'inv', n); g.saveGame(); g.content.refreshSvc(m ? `${parts[1] === 'in' ? 'Deposited' : 'Withdrew'} ${fmtMoney(m)}.` : 'Nothing moved.'); return; }
      if (k === 'wcrew') { const e = uw.crew.assign(+parts[1], parts[2], 'w:' + id); g.saveGame(); g.content.refreshSvc(e || `${uw.crew.find(+parts[1]).name.split(' ')[0]} works here now (${CREW_ROLES[parts[2]].name}).`); return; }
    }
    const st = S.storage[id] || (S.storage[id] = {});
    switch (k) {
      case 'buy': g.ui.ask(`Buy ${d.name}?`, `${fmtMoney(uw.props.price(d))}. ${d.desc}`, 'Buy', () => { const e = uw.props.buy(id); g.content.refreshSvc(e || 'It’s yours.'); }); return;
      case 'save': if (!uw.isStable()) r = 'Not now: you need to be clear of the police and any fight.'; else { g.saveGame(true); r = 'Game saved.'; } break;
      case 'sleep': g.ui.back(); uw.props.sleep(id); return;
      case 'wardrobe': g.content.openWardrobe(); return;
      case 'garage': { const gp = uw.props.garagePoints().find(p => p.id === id); if (gp) g.content.openGarage(gp); return; }
      case 'view': { g.ui.closeAll(); g.content.enterHome(id, true); return; }
      case 'breakin': { if (g.police.level > 0) { r = 'Not with the police on you.'; break; } if (!uw.tools.usePick()) { r = 'You need a lockpick set (Dockside Sully sells them).'; break; } g.ui.closeAll(); const L0 = uw.loc('prop', id); if (L0) g.police.crime('theft', L0.x, L0.z); g.content.enterHome(id, true, true); return; }
      case 'upgrade': { r = PM.upgrade(id) || `${d.name} is now level ${PM.level(id)}: ${BIZ_LEVEL_NAME[PM.level(id) - 1].toLowerCase()}.`; break; }
      case 'fence': this.openFence(id); return;
      case 'crew': g.ui.back(); this.open('crew'); return;
      case 'repair': r = uw.props.repair(id) || 'Repaired.'; break;
      case 'respray': case 'carfix': {
        const v = uw.nearVehicle(18);
        if (!v) { r = 'Bring a car within a few metres.'; break; }
        const rpc = Math.round(300 * (1 - uw.props.perk('respray')) / 10) * 10;
        if (k === 'respray') { if (!Money.pay(rpc, 'garage')) { r = `Costs ${fmtMoney(rpc)} from your bank.`; break; } const col = pick(VEHICLES[v.type].colors.concat([0x1c2833, 0xecf0f1, 0x7b241c])); v.colorHex = col; v.mat.userData.u.uPaint.value.setHex(col); if (v.garageUid) { const e = g.save.garage.find(x => x.uid === v.garageUid); if (e) e.color = col; } if (g.police.level > 0 && !g.police.visible) { g.police.clear('New paint and plates. They lost your description.'); } r = 'Fresh paint, new plates.'; }
        else { const c = Math.round(g.content.repairCost(v.type, v.health) * 0.7); if (!Money.pay(c, 'garage')) { r = `Repairs cost ${fmtMoney(c)} from your bank.`; break; } g.content.repair(v); r = 'Good as new.'; }
        break;
      }
      case 'st': case 'tk': case 'ld': { // pockets/trunk <-> this property's stash, cost basis travels with the goods
        const v = uw.nearVehicle(), parts = a.split(':'), want = parts[2] === undefined || parts[2] === '' ? -1 : +parts[2] || 0; // no amount = everything
        const all = n => want < 0 ? n : Math.min(n, want);
        let n = 0;
        if (k === 'st') {
          n += Inv.move(S.inv, st, good, all(Inv.has(S.inv, good)), uw.props.storageFree(id));
          if (v && (want < 0 || n < want)) n += Inv.move(v.trunk, st, good, want < 0 ? Inv.has(v.trunk, good) : want - n, uw.props.storageFree(id));
          r = n ? `Stored ${fmtQty(good, n)} ${GOODS[good].name}.` : 'No room here.';
        } else if (k === 'tk') { n = Inv.move(st, S.inv, good, all(Inv.has(st, good)), uw.pocketFree()); r = n ? `Took ${fmtQty(good, n)}.` : 'Your pockets are full.'; }
        else if (v) { n = Inv.move(st, v.trunk, good, Math.min(all(Inv.has(st, good)), uw.trunkFit(v, good))); r = n ? `Loaded ${fmtQty(good, n)} into the trunk.` : 'The trunk is full.'; }
        break;
      }
      default: { const ar = uw.armory.act(a, id); if (ar !== null) r = ar; }
    }
    g.saveGame();
    g.content.refreshSvc(r);
  }
  openFence(propId) {
    const uw = this.uw, g = this.g, owned = uw.props.owned('pawn') || uw.props.owned('pawn_s');
    const goods = ['hot', 'smokes'], fb = 1 + uw.props.perk('fence');
    const price = k => Math.round(uw.market.price('o', k) * (k === 'hot' ? (owned ? 1.0 : 0.85) * fb : 0.7));
    const render = () => { const c = uw.carried(); return `<div class="svcTop"><span>Lucky’s Pawn${owned ? ' (yours)' : ''}</span><span>${Money.html('fence')}</span></div><div class="jobs">` + goods.map(k => `<div class="job"><i>■</i><div><b>${GOODS[k].name}</b><span>${c[k] | 0} carried · ${fmtMoney(price(k))} each</span></div><button class="sbtn gold" data-act="sell:${k}" ${(c[k] | 0) ? '' : 'disabled'}>Sell all</button></div>`).join('') + '</div><div class="hint">No questions asked. Fences pay less than the street but never call the police.</div>'; };
    g.content.openSvc('Fence', 'Lucky: “Let’s see what you’ve got.”', render, a => {
      const k = a.split(':')[1], n = uw.carried()[k] | 0; if (!n) return;
      uw.take(k, n); const cash = price(k) * n; g.earn(cash, 'fence'); uw.realize(cash, k); uw.market.sold('o', k, n); uw.S.st.sold += n;
      if (n >= 5) uw.addRep(Math.min(20, n), null);
      g.audio.play('cash'); g.saveGame(); g.content.refreshSvc(`Sold ${n} for ${fmtMoney(cash)}.`);
    });
  }
  openChopInfo() {
    const uw = this.uw, g = this.g;
    g.content.openSvc('Saltworks Chop Shop', 'Drive a stolen car into the yard and stop to sell it. Wanted cars pay 60% more.', () => `<div class="hint">On the wanted list today: <b>${uw.S.chopWanted.map(t => VEHICLES[t].name).join(', ')}</b>.</div><div class="stats">${Object.keys(CHOP_VALUE).filter(t => VEHICLES[t]).map(t => `<span>${VEHICLES[t].name}</span><span>${fmtMoney(CHOP_VALUE[t])}</span>`).join('')}</div>`, () => {});
  }
  // the laundering fixer (§45.6): carried Dirty Cash in, Clean Bank FIXER_DELAY economic hours later, minus her fee
  openFixer(L) {
    const uw = this.uw, g = this.g, FX = uw.fixer, F = uw.S.fixer;
    const amounts = [500, 1000, 2500, FIXER_DAY_CAP];
    const render = () => {
      const cap = FX.capacityLeft(), have = Money.available('launderIn');
      const pend = F.batches.map(b => `<span>${fmtMoney(b.dirty)} → ${fmtMoney(b.clean)}</span><span>in about ${Math.max(1, Math.ceil(FX.hoursLeft(b)))} h</span>`).join('');
      return `<div class="svcTop"><span>Cash on you <b class="money">${fmtMoney(have)}</b></span><span>She’ll take today <b class="money">${fmtMoney(cap)}</b></span><span>Fee <b>${Math.round(FIXER_FEE * 100)}%</b></span></div>
        <div class="hint">Dirty Cash you hand her lands in your bank, minus her cut, about ${Math.round(FIXER_DELAY / uw.econRate())} hours later. Once it’s with her it isn’t on you: the police can’t take it off you. A front business (later) will wash more, for less.</div>
        <div class="btns">${amounts.map(n => { const l = FX.limit(n); return `<button class="sbtn${n === FIXER_DAY_CAP ? ' gold' : ''}" data-act="wash:${n}" ${l.take ? '' : 'disabled'}>${n === FIXER_DAY_CAP ? 'As much as she’ll take' : fmtMoney(n)}</button>`; }).join('')}</div>
        ${(() => { const l = FX.limit(FIXER_DAY_CAP); return l.take ? `<div class="hint">${fmtMoney(l.take)} now: you get ${fmtMoney(FX.quote(l.take).clean)}, she keeps ${fmtMoney(FX.quote(l.take).fee)}.</div>` : `<div class="hint">${esc(l.why)}</div>`; })()}
        ${F.batches.length ? `<h3>With her now</h3><div class="stats">${pend}</div>` : ''}
        ${F.washed ? `<div class="hint">Washed so far: ${fmtMoney(F.washed)} for ${fmtMoney(F.fees)} in fees.</div>` : ''}`;
    };
    g.content.openSvc(L.def.name, '“Cash. Counted in front of me. Your bank gets it tomorrow, give or take.”', render, a => {
      const [k, v] = a.split(':'); if (k !== 'wash') return;
      const r = FX.hand(+v);
      if (typeof r === 'string') { g.content.refreshSvc(r); return; }
      g.audio.play('cash');
      g.content.refreshSvc(`She counts ${fmtMoney(r.dirty)} twice. ${fmtMoney(r.clean)} will be in your bank in about ${Math.round(FIXER_DELAY / uw.econRate())} hours.`);
    });
  }
  openSpot(L) {
    const uw = this.uw, g = this.g, S = uw.S, s = L.def;
    if (s.arms) { this.openArmorer(L); return; }
    if (s.fixer) { this.openFixer(L); return; }
    const z = L.zone;
    const stock = S.supply[s.id] || (S.supply[s.id] = {});
    for (const k of s.sells) if (stock[k] === undefined) stock[k] = Math.round(30 * S.market[z][k][0] / GOODS[k].size);
    const locked = g.save.rep < (s.rep || 0) && !(S.flags.intro && S.flags.intro[s.id]);
    const render = () => `<div class="svcTop"><span>${esc(s.role)}</span><span>Pockets <b>${units(S.inv)}/${POCKET_CAP}</b>${uw.nearVehicle() ? ` · trunk <b>${fmtLb(cargoC(uw.nearVehicle().trunk))} / ${fmtLb(cargoCapC(uw.nearVehicle().type))}</b>` : ''}</span><span>${Money.html('supplier')}</span></div>` +
      (locked ? `<div class="hint">${esc(s.name)} doesn’t deal with nobodies. (${s.rep} Rep)</div>` : '<div class="jobs">' + s.sells.map(k => {
        const p = uw.market.wholesale(z, k), n = stock[k] | 0, lb = GOOD_UNIT[k][2] < 1;
        const qs = lb ? [1, 2, 5] : [1, 5, 20];
        return `<div class="job" style="flex-wrap:wrap"><i style="color:${TIERS[GOODS[k].tier].col}">■</i><div style="min-width:170px"><b>${GOODS[k].name}</b><span>${fmtPerUnit(k, p)} · ${fmtQty(k, n)} available · ${TIERS[GOODS[k].tier].name} · street price here ${fmtPerUnit(k, uw.market.price(z, k))}</span></div><div class="btns">${qs.map(q => { const lots = lotsFor(k, q); return `<button class="sbtn" data-act="buy:${k}:${lots}" ${n < lots || !Money.can(p * lots, 'supplier') ? 'disabled' : ''}>${lb ? q + ' lb' : '×' + q} · ${fmtMoney(p * lots)}</button>`; }).join('')}</div></div>`;
      }).join('') + '</div><div class="hint">Product goes in your pockets, then the trunk of a car parked nearby. Every lot remembers what you paid, so the Inventory tab shows what it is worth now and your profit or loss. Store it at a property, sell it to street buyers, or put crew on it.</div>') + (s.id === 'sully' ? uw.tools.shopHTML() : '');
    g.content.openSvc(s.name, '', render, a => {
      // Sully sells lockpick sets as well (M10)
      if (s.id === 'sully' && a.startsWith('pick:')) { const e = uw.tools.buy(+a.split(':')[1]); g.content.refreshSvc(e || 'A roll of picks and tension wrenches. Don’t get caught with them.'); return; }
      const [, k, q] = a.split(':'); if (locked || !GOODS[k]) return;
      const p = uw.market.wholesale(z, k);
      let n = Math.min(+q, stock[k] | 0, Math.floor(Money.available('supplier') / p));
      if (n <= 0) return;
      const got = uw.give({ [k]: n }, 'buy', { [k]: p });
      if (!got) { g.content.refreshSvc('No room in your pockets or a nearby trunk.'); return; }
      n = got[k]; Money.pay(n * p, 'supplier'); stock[k] -= n; uw.market.bought(z, k, n);
      g.audio.play('cash'); g.saveGame(); g.content.refreshSvc(`Bought ${fmtQty(k, n)} ${GOODS[k].name} for ${fmtMoney(n * p)}.`);
    });
  }
  // The Armorer: five clear sections. Buying a gun you already own is impossible (one of each);
  // ammo is sold by the box and counted in rounds; armour can be worn now or sent to a stash.
  openArmorer(L) {
    const uw = this.uw, g = this.g, S = uw.S, s = g.save, z = L.zone, A = uw.armory;
    const GUNS = [
      { id: 'bat', name: 'Baseball bat', price: 150, rep: 0, desc: 'Melee. Every hit knocks someone down.' },
      { id: 'pistol', name: 'Pistol', price: 1500, rep: 0, desc: 'Secondary. Moderate damage, accurate. Comes with 24 rounds.', ammo: 24 },
      { id: 'shotgun', name: 'Shotgun', price: 3800, rep: 300, desc: 'Primary. Devastating up close, useless far away. Comes with 18 shells.', ammo: 18 },
      { id: 'smg', name: 'Compact SMG', price: 6500, rep: 600, desc: 'Primary. Light hits, very fast fire. Comes with 90 rounds.', ammo: 90 }
    ];
    const BOXES = [
      { gun: 'pistol', n: 24, price: 120 }, { gun: 'pistol', n: 96, price: 440 },
      { gun: 'shotgun', n: 12, price: 160 }, { gun: 'shotgun', n: 48, price: 590 },
      { gun: 'smg', n: 90, price: 360 }, { gun: 'smg', n: 270, price: 1000 }
    ];
    const hw = uw.market.wholesale(z, 'hardware'), hs = Math.round(uw.market.price(z, 'hardware') * 0.9);
    const stock = S.supply.armorer || (S.supply.armorer = { hardware: 8 });
    const tabs = [['guns', 'Buy weapons'], ['ammo', 'Buy ammo'], ['armor', 'Buy armor'], ['loadout', 'Loadout'], ['stash', 'Stash']];
    if (!tabs.some(t => t[0] === this.armTab)) this.armTab = 'guns';
    const owned = uw.props.ownedList().filter(d => d.storage);
    const render = () => {
      let h = `<div class="svcTop"><span>Reputation <b>${s.rep}</b></span><span>Wearing <b>${g.player.vest >= 1 ? Math.round(g.player.vest) + ' / ' + VEST_MAX : 'no vest'}</b></span><span>${Money.html('armorer')}</span></div><div class="tabs">${tabs.map(([k, n]) => `<button class="etab${this.armTab === k ? ' on' : ''}" data-act="tab:${k}">${n}</button>`).join('')}</div>`;
      if (this.armTab === 'guns') {
        h += '<div class="grid2">' + GUNS.map(it => {
          const own = s.weapons[it.id], lock = it.rep && s.rep < it.rep;
          return `<div class="card${lock ? ' locked' : ''}"><div class="t">${it.name} ${own ? `<span class="chip" style="--c:#7fe08f">OWNED</span>` : ''}</div><div class="d">${it.desc}${own ? `<br><b>${esc(A.whereText(it.id))}</b>` : ''}</div><button class="sbtn gold" data-act="w:${it.id}" ${own || lock || !Money.can(it.price, 'armorer') ? 'disabled' : ''}>${own ? 'Owned — one is all you need' : lock ? 'Needs ' + it.rep + ' rep' : fmtMoney(it.price)}</button></div>`;
        }).join('') + '</div>';
        h += `<h3>Hardware <small>bulk product, untraceable</small></h3><div class="jobs"><div class="job"><i style="color:${TIERS[3].col}">■</i><div><b>Buy hardware</b><span>${fmtMoney(hw)} a unit · ${fmtQty('hardware', stock.hardware | 0)} available${s.rep < 500 ? ' · needs 500 rep' : ''}</span></div><button class="sbtn" data-act="hb:1" ${s.rep < 500 || (stock.hardware | 0) < 1 || !Money.can(hw, 'armorer') ? 'disabled' : ''}>×1</button><button class="sbtn" data-act="hb:5" ${s.rep < 500 || (stock.hardware | 0) < 5 || !Money.can(hw * 5, 'armorer') ? 'disabled' : ''}>×5</button></div>
          <div class="job"><i style="color:${TIERS[3].col}">■</i><div><b>Sell hardware</b><span>${fmtMoney(hs)} a unit · ${fmtQty('hardware', uw.carried().hardware | 0)} carried</span></div><button class="sbtn gold" data-act="hs" ${(uw.carried().hardware | 0) ? '' : 'disabled'}>Sell all</button></div></div>`;
      } else if (this.armTab === 'ammo') {
        h += '<div class="grid2">' + BOXES.map((bx, i) => {
          const w = WEAPONS.find(x => x.id === bx.gun), own = s.weapons[bx.gun];
          return `<div class="card${own ? '' : ' locked'}"><div class="t">${w.name}: ${bx.n} ${w.ammoName}</div><div class="d">On you: ${A.roundsOn(bx.gun)} ${w.ammoName} (${g.player.mag[bx.gun] | 0} in the magazine)${A.roundsStashed(bx.gun) ? ` · ${A.roundsStashed(bx.gun)} in stashes` : ''}</div><button class="sbtn gold" data-act="a:${i}" ${!own || !Money.can(bx.price, 'armorer') ? 'disabled' : ''}>${own ? fmtMoney(bx.price) : 'You need the gun'}</button></div>`;
        }).join('') + '</div><div class="hint">Rounds go straight into your pockets. Leave spare boxes in a property stash so an arrest doesn’t cost you them.</div>';
      } else if (this.armTab === 'armor') {
        const fresh = g.player.vest >= VEST_MAX * 0.95;
        h += `<div class="grid2"><div class="card${s.rep < 100 ? ' locked' : ''}"><div class="t">Kevlar vest · wear it now</div><div class="d">${VEST_MAX} armour points, a layer on top of your health: it soaks ${Math.round(VEST_SOAK * 100)}% of every hit until it is spent. ${g.player.vest >= 1 ? `You are wearing one with ${Math.round(g.player.vest)} points left; a new one replaces it.` : ''}</div><button class="sbtn gold" data-act="vest" ${fresh || s.rep < 100 || !Money.can(450, 'armorer') ? 'disabled' : ''}>${fresh ? 'Already wearing a fresh one' : s.rep < 100 ? 'Needs 100 rep' : '$450'}</button></div>
          <div class="card${s.rep < 100 || !owned.length ? ' locked' : ''}"><div class="t">Spare vest · delivered to a stash</div><div class="d">${owned.length ? 'Put it on later at that property.' : 'You need a property with a stash.'}</div>${owned.length ? `<select data-sel="vto">${owned.map(d => `<option value="${d.id}" ${this.vestTo === d.id ? 'selected' : ''}>${esc(d.name)}</option>`).join('')}</select>` : ''}<button class="sbtn" data-act="vspare" ${!owned.length || s.rep < 100 || !Money.can(480, 'armorer') ? 'disabled' : ''}>$480</button></div></div>`;
      } else if (this.armTab === 'loadout') h += A.loadoutHTML(null);
      else h += A.stashesHTML();
      return h;
    };
    g.content.openSvc('The Armorer', '“Cash only. No receipts. No refunds.”', render, a => {
      const [k, id] = a.split(':');
      let r = '';
      if (k === 'tab') { this.armTab = id; g.content.refreshSvc(); return; }
      if (k === 'vto') { this.vestTo = id; return; }
      if (k === 'w') {
        const it = GUNS.find(x => x.id === id); if (!it || !Money.can(it.price, 'armorer') || s.weapons[it.id] || (it.rep && s.rep < it.rep)) return;
        s.weapons[it.id] = true; s.wloc[it.id] = null; if (it.ammo) s.ammo[it.id] += it.ammo; g.player.selectWeapon(WEAPONS.findIndex(w => w.id === it.id));
        Money.pay(it.price, 'armorer'); r = `${it.name} — yours. It’s in your hand.`;
      } else if (k === 'a') {
        const bx = BOXES[+id]; if (!bx || !s.weapons[bx.gun] || !Money.can(bx.price, 'armorer')) return;
        s.ammo[bx.gun] += bx.n; Money.pay(bx.price, 'armorer'); r = `+${bx.n} ${WEAPONS.find(x => x.id === bx.gun).ammoName}.`;
      } else if (k === 'vest') {
        if (g.player.vest >= VEST_MAX * 0.95 || s.rep < 100 || !Money.can(450, 'armorer')) return;
        g.player.vest = VEST_MAX; s.vest = VEST_MAX; Money.pay(450, 'armorer'); r = 'Strapped in.';
      } else if (k === 'vspare') {
        const pid = this.vestTo && uw.props.owned(this.vestTo) ? this.vestTo : owned[0] && owned[0].id; if (!pid || !Money.can(480, 'armorer') || s.rep < 100) return;
        A.ws(pid).vests.push(VEST_MAX); Money.pay(480, 'armorer'); r = `A spare vest is waiting at ${PROP_BY_ID[pid].name}.`;
      } else if (k === 'hb') {
        const n = Math.min(+id, stock.hardware | 0, Math.floor(Money.available('armorer') / hw)); const got = n > 0 ? uw.give({ hardware: n }, 'buy', { hardware: hw }) : null;
        if (!got) r = 'No room to carry it.'; else { Money.pay(got.hardware * hw, 'armorer'); stock.hardware -= got.hardware; r = `Bought ${fmtQty('hardware', got.hardware)} hardware.`; }
      } else if (k === 'hs') {
        const n = uw.carried().hardware | 0; if (n) { uw.take('hardware', n); g.earn(n * hs, 'arms'); uw.realize(n * hs, 'hardware'); uw.market.sold(z, 'hardware', n); uw.S.st.sold += n; r = `Sold ${fmtQty('hardware', n)} for ${fmtMoney(n * hs)}.`; uw.addRep(n * 4, null); }
      } else { const ar = A.act(a, null); if (ar === null) return; r = ar; g.content.refreshSvc(r); g.saveGame(); return; }
      g.audio.play('cash'); g.saveGame(); g.content.refreshSvc(r);
    });
  }
  // street buyers at a deal corner
  openDeal(gr) {
    const uw = this.uw, g = this.g, S = uw.S, i = gr.turf, t = uw.T[i], z = t.zone;
    const q = S.dealQ[i] || (S.dealQ[i] = {});
    for (const k of GOOD_IDS) if (q[k] === undefined && !GOODS[k].fence && !GOODS[k].arms) q[k] = Math.max(0, Math.round(2 + uw.market.demand(z, k) * 5 - (S.market[z][k][0] - 1) * 3));
    const own = uw.owner[i];
    const bonus = own === 'pc' ? 1.1 : 1;
    const price = k => Math.round(uw.market.price(z, k) * bonus);
    const render = () => {
      const c = uw.carried();
      const rows = GOOD_IDS.filter(k => q[k] !== undefined);
      return `<div class="svcTop"><span>${esc(t.name)} · ${esc(ZONES[z].name)}</span><span>Risk <b>${Math.round(this.dealRisk(i) * 100)}%</b></span><span>${Money.html('deal')}</span></div>${own && own !== 'pc' ? `<div class="hint">This is ${FACTIONS[own].short} turf. Dealing here costs you with them.</div>` : ''}<div class="jobs">` +
        rows.map(k => { const lb = GOOD_UNIT[k][2] < 1, opts = lb ? [[1, lotsFor(k, 1)], [5, lotsFor(k, 5)]] : [[1, 1], [5, 5]]; const pl = c[k] ? price(k) - Inv.avg(c, k) : 0; return `<div class="job" style="flex-wrap:wrap"><i style="color:${TIERS[GOODS[k].tier].col}">■</i><div style="min-width:170px"><b>${GOODS[k].name}</b><span>${fmtPerUnit(k, price(k))} · they want ${fmtQty(k, q[k])} · you have ${fmtQty(k, c[k] | 0)}${c[k] && Inv.cost(c, k) ? ` · ${pl >= 0 ? '+' : '−'}${fmtMoney(Math.abs(perUnit(k, pl)))}/${unitName(k)} vs what you paid` : ''}</span></div><div class="btns">${opts.map(([t, n]) => `<button class="sbtn" data-act="s:${k}:${n}" ${(c[k] | 0) < 1 || q[k] < 1 ? 'disabled' : ''}>${lb ? t + ' lb' : '×' + t}</button>`).join('')}<button class="sbtn gold" data-act="s:${k}:999" ${(c[k] | 0) < 1 || q[k] < 1 ? 'disabled' : ''}>Max</button></div></div>`; }).join('') + '</div><div class="hint">Each deal risks an undercover cop or a patrol seeing it. Quotas refill daily.</div>';
    };
    g.content.openSvc('Street buyers', '', render, a => {
      const [, k, nn] = a.split(':');
      const have = uw.carried()[k] | 0;
      const n = Math.min(+nn, have, q[k] | 0); if (n <= 0) return;
      // the risk roll happens once per handoff
      const risk = this.dealRisk(i);
      if (Math.random() < risk) {
        uw.take(k, n); uw.realize(0, k); S.st.seized += n;
        g.ui.back();
        g.ui.banner('Undercover!', 'It was a setup', 'fail', 2.5);
        g.police.addHeat(4, g.player.pos.x, g.player.pos.z); uw.cops.crime('deal', 2, true, g.player.pos.x, g.player.pos.z);
        for (const m of gr.members) { m.brain = null; m.keep = false; m.state = 'flee'; m.timer = 6; m.fleeFrom = { x: g.player.pos.x, z: g.player.pos.z }; }
        return;
      }
      uw.take(k, n); q[k] -= n;
      const cash = price(k) * n; g.earn(cash, 'deal'); uw.realize(cash, k); S.st.sold += n; S.st.earnedDeals += cash;
      uw.market.sold(z, k, n); uw.addRep(Math.max(1, Math.round(n * (GOODS[k].tier + 1) * 0.8)), null);
      uw.addInf(i, 'pc', n * 0.25);
      S.pressure = clamp(S.pressure + n * GOODS[k].heat * 0.06, 0, 100); S.turfs[i].police = clamp(S.turfs[i].police + n * 0.2, 0, 100);
      if (own && own !== 'pc' && FACTIONS[own]) uw.threats.press(own, PRESSURE.deal, 'selling on their corners');
      if (own && own !== 'pc' && FACTIONS[own]) { S.factions[own].rel -= 1 + n * 0.3; if (uw.attitude(own) === 'hostile') for (const gg of uw.gangs.groups.values()) if (gg.fid === own && gg.members.some(m => dist2(m.x, m.z, g.player.pos.x, g.player.pos.z) < 40 * 40)) gg.hostile = true; }
      if (g.police.copCanSee(g.player.pos.x, g.player.pos.z, 40)) { g.police.crime('deal', g.player.pos.x, g.player.pos.z); }
      g.audio.play('cash'); g.saveGame(); g.content.refreshSvc(`Sold ${fmtQty(k, n)} ${GOODS[k].name} for ${fmtMoney(cash)}.`);
    });
  }
  dealRisk(i) {
    const uw = this.uw, S = uw.S;
    let r = 0.02 + S.pressure / 450 + S.turfs[i].police / 500;
    if (uw.owner[i] === 'pc') r *= 0.6;
    if (S.taskforce > 0) r += 0.04;
    return clamp(r, 0.01, 0.4);
  }
  // ---------------------------------------------------------------- boss sit-down
  openBoss(fid) {
    const uw = this.uw, g = this.g, S = uw.S, F = FACTIONS[fid], f = S.factions[fid];
    const lines = {
      hothead: { dismissive: 'Who let this nobody near me? Walk away while you still can.', concerned: 'You’ve been busy. Busy people get noticed. Busy people get hurt.', respect: 'Alright. You’re for real. Let’s talk like it.', fearful: 'Okay, okay. Nobody wants a war with you. What do you want?', hostile: 'You’ve got some nerve showing your face here.', friendly: 'My people tell me you’re good for business. Respect.' },
      calculating: { dismissive: 'You are a rounding error on my manifest. Come back when you are not.', concerned: 'Your numbers are interesting. Interesting numbers are a problem for me.', respect: 'You have become a factor. I prefer factors I can negotiate with.', fearful: 'I have run the numbers. Fighting you costs more than paying you.', hostile: 'You stole from me. Every boat that lands reminds me.', friendly: 'Our arrangement is profitable. Let us keep it so.' },
      charming: { dismissive: 'Darling, the door is that way. Do mind the rope.', concerned: 'Everybody on the Strip is whispering your name. I do hate to be the last to know a person.', respect: 'Sit. Have a drink. People like us should be friends.', fearful: 'Let’s not be ugly about this. I’m sure we can come to an arrangement.', hostile: 'You’ve been rude to my people. I never forget rude.', friendly: 'My favourite business partner. What can I do for you?' },
      honor: { dismissive: 'In my day, a man earned an audience. Go earn one.', concerned: 'You don’t know the rules here. Somebody should teach you before somebody buries you.', respect: 'You conduct yourself properly. That earns my respect, and a conversation.', fearful: 'My father would have fought you. I am wiser than my father. Name your terms.', hostile: 'You have insulted this family. There will be an answer.', friendly: 'You keep your word. So do we.' },
      cold: { dismissive: 'You don’t register. That is the nicest thing I will ever say to you.', concerned: 'You are becoming a variable. I eliminate variables.', respect: 'You have built something. I respect efficient people.', fearful: 'Let’s be rational. Conflict is expensive. Tribute is not.', hostile: 'I have friends at Police HQ. You will meet them soon.', friendly: 'Our interests align. For now.' }
    };
    const pers = F.boss.pers;
    const ratio = uw.powerRatio(fid), att = uw.attitude(fid);
    const mood = att === 'hostile' ? 'hostile' : att === 'friendly' ? 'friendly' : ratio > 2.2 ? 'fearful' : ratio > 0.8 ? 'respect' : ratio > 0.3 ? 'concerned' : 'dismissive';
    const respectCost = Math.round((2000 + f.strength * 60) / 100) * 100;
    const truceCost = Math.round((5000 + f.strength * 150) / 100) * 100;
    const sells = fid === 'tidewater' ? ['snow', 'hardware', 'smokes'] : fid === 'velvet' ? ['pills'] : fid === 'vipers' ? ['green'] : [];
    const render = () => {
      let h = `<div class="bossCard" style="border-left:4px solid ${F.col}"><b>${esc(f.boss)}</b><small>${esc(F.boss.title)} · ${esc(F.name)}</small><p>“${esc(lines[pers][mood])}”</p></div>`;
      h += `<div class="stats"><span>Their strength</span><span>${Math.round(f.strength)} · ${uw.factionTurfs(fid)} turfs</span><span>Your standing</span><span>${att} (${Math.round(f.rel)})</span></div><div class="jobs">`;
      const opt = (act, title, desc, ok = true) => `<div class="job${ok ? '' : ' locked'}"><i>›</i><div><b>${title}</b><span>${desc}</span></div><button class="sbtn${ok ? ' gold' : ''}" data-act="${act}" ${ok ? '' : 'disabled'}>Go</button></div>`;
      if (mood !== 'hostile') h += opt('respect', `Pay respect (${fmtMoney(respectCost)})`, 'An envelope and a handshake. Improves relations.', Money.can(respectCost, 'respect'));
      if (sells.length && f.rel > -20 && mood !== 'dismissive') h += opt('buy', 'Buy product wholesale', `${sells.map(k => GOODS[k].name).join(', ')} straight from the source.`, g.save.rep >= 300);
      if (mood !== 'dismissive' && f.truce <= S.day) h += opt('truce', `Propose a truce (${fmtMoney(ratio > 1.5 ? 0 : truceCost)})`, 'Two weeks without attacks on each other’s turf.', ratio > 0.6 && (ratio > 1.5 || Money.can(truceCost, 'truce')));
      if (ratio > 2 && !f.tribute) h += opt('tribute', 'Demand tribute', 'They pay you every day, or they fight.', true);
      if (ratio > 3) h += opt('turf', 'Demand a turf', 'They hand over a turf that borders yours.', true);
      if (f.truce > S.day) h += opt('break', 'End the truce', 'Back to business as usual. They won’t like it.', true);
      h += opt('war', 'Declare war', 'They will come for your turfs and businesses.', true);
      return h + '</div>';
    };
    g.content.openSvc(f.boss, '', render, a => {
      let r = '';
      switch (a) {
        case 'respect': if (!Money.pay(respectCost, 'respect')) return; f.rel = clamp(f.rel + 18, -100, 100); r = 'They take the envelope. Something thaws.'; break;
        case 'buy': this.openTidewaterDeal(fid, sells); return;
        case 'truce': {
          const cost = ratio > 1.5 ? 0 : truceCost;
          const accept = Math.random() < clamp(0.35 + ratio * 0.25 + f.rel / 200 - (pers === 'hothead' ? 0.2 : 0), 0.05, 0.95);
          if (!accept) { r = 'They laugh at the offer.'; f.rel -= 3; break; }
          if (cost > 0 && !Money.pay(cost, 'truce')) { r = 'You don’t have the cash on you.'; break; }
          f.truce = S.day + 14; f.rel = clamp(f.rel + 20, -100, 100);
          for (const t of S.turfs) if (t.war && ((t.war.a === fid && t.war.d === 'pc') || (t.war.a === 'pc' && t.war.d === fid))) t.war = null;
          r = 'Agreed. Two weeks of peace.'; break;
        }
        case 'tribute': {
          const accept = Math.random() < clamp(0.25 + (ratio - 2) * 0.3 - (pers === 'hothead' ? 0.25 : pers === 'honor' ? 0.1 : 0) + (pers === 'calculating' || pers === 'cold' ? 0.1 : 0), 0.05, 0.95);
          if (accept) { f.tribute = Math.round(600 + f.strength * 25); f.truce = S.day + 30; f.rel -= 10; r = `They’ll pay ${fmtMoney(f.tribute)} a day.`; uw.addRep(60, null); }
          else { f.rel -= 35; r = 'They refuse — and they’re angry now.'; uw.factions.chooseWar(fid, true); }
          break;
        }
        case 'turf': { const n0 = uw.playerTurfs(); uw.factions.cedeTurf(fid); uw.recompute(); f.rel -= 20; r = uw.playerTurfs() > n0 ? 'A turf changes hands.' : 'There’s nothing next to yours to give.'; break; }
        case 'break': f.truce = 0; f.tribute = 0; f.rel -= 25; r = 'The truce is over.'; break;
        case 'war': f.rel = -80; f.truce = 0; f.tribute = 0; uw.gangs.provoke(fid, GANG_AGGRO.war, g.player.pos.x, g.player.pos.z); uw.factions.chooseWar(fid, true); r = 'War it is.'; for (const gg of uw.gangs.groups.values()) if (gg.fid === fid) gg.hostile = true; g.ui.back(); g.saveGame(); return;
      }
      g.saveGame(); g.content.refreshSvc(r);
    });
  }
  openTidewaterDeal(fid, sells) {
    const uw = this.uw, g = this.g, S = uw.S, f = S.factions[fid];
    const z = FACTIONS[fid].home;
    const price = k => Math.round(uw.market.wholesale(z, k) * (1.05 - clamp(f.rel, -20, 60) / 300));
    const render = () => `<div class="svcTop"><span>${esc(f.boss)}</span><span>Their stock <b>${Math.round(f.stock)} lots</b></span><span>${Money.html('supplier')}</span></div><div class="jobs">` + sells.map(k => { const lb = GOOD_UNIT[k][2] < 1, qs = lb ? [5, 10] : [5, 20]; return `<div class="job" style="flex-wrap:wrap"><i style="color:${TIERS[GOODS[k].tier].col}">■</i><div style="min-width:170px"><b>${GOODS[k].name}</b><span>${fmtPerUnit(k, price(k))}</span></div><div class="btns">${qs.map(q => { const lots = lotsFor(k, q); return `<button class="sbtn" data-act="b:${k}:${lots}" ${f.stock < lots || !Money.can(price(k) * lots, 'supplier') ? 'disabled' : ''}>${lb ? q + ' lb' : '×' + q} · ${fmtMoney(price(k) * lots)}</button>`; }).join('')}</div></div>`; }).join('') + '</div>';
    g.content.openSvc(`${FACTIONS[fid].short} wholesale`, 'Bring a car with trunk space for big orders.', render, a => {
      const [, k, q] = a.split(':'); if (!GOODS[k]) return;
      const pr = price(k), want = Math.min(+q, Math.floor(f.stock), Math.floor(Money.available('supplier') / pr)); if (want <= 0) return;
      const got = uw.give({ [k]: want }, 'buy', { [k]: pr }); if (!got) { g.content.refreshSvc('No room to carry it.'); return; }
      const n = got[k]; Money.pay(n * pr, 'supplier'); f.stock -= n; f.money += n * pr; f.rel = clamp(f.rel + 1, -100, 100);
      uw.market.bought(z, k, n); g.audio.play('cash'); g.saveGame(); g.content.refreshSvc(`Bought ${fmtQty(k, n)} ${GOODS[k].name}.`);
    });
  }
  // ---------------------------------------------------------------- big map overlay & jail HUD
  toggleOverlay(on) {
    this.uw.mapOverlay = on !== undefined ? on : !this.uw.mapOverlay;
    $('ovBtn').textContent = 'Territory overlay: ' + (this.uw.mapOverlay ? 'ON' : 'OFF');
    $('turfInfo').classList.add('hidden');
    if (this.g.mapOpen) this.g.ui.drawBigMap();
  }
  mapClick(x, z) {
    if (!this.uw.mapOverlay || x < 0 || z < 0 || x >= CITY || z >= CITY) return false;
    const i = turfAt(x, z), el = $('turfInfo');
    el.innerHTML = this.turfCard(i) + '<div class="hint">Tap outside to close · T toggles the overlay</div>';
    el.classList.remove('hidden');
    el.querySelectorAll('[data-act]').forEach(b => b.addEventListener('click', ev => { ev.stopPropagation(); const [, x2, z2, n] = b.dataset.act.split(':'); this.g.content.setWaypoint(+x2, +z2, decodeURIComponent(n)); this.g.ui.toast('Waypoint set.'); }));
    return true;
  }
  showJail(on) { $('jailHud').classList.toggle('hidden', !on); this.updateJail(true); }
  updateJail(force) {
    const S = this.uw.S, j = S.jail; if (!j) return;
    this._jt = (this._jt || 0) - 1;
    if (!force && this._jt > 0) return; this._jt = 6;
    const esc2 = this.uw.prison.esc;
    $('jailDays').textContent = esc2 ? `LIGHTS OUT · ${Math.max(0, Math.ceil(esc2.t))}s to the morning count` : `${fmtSentence(j.total - j.served)} left`;
    $('jailLeft').textContent = `Sentence ${fmtSentence(j.total)} · served ${fmtSentence(j.served)}${j.credit ? ` · ${fmtSentence(j.credit)} good time` : ''}`;
    $('jailBar').style.width = (j.served / Math.max(1, j.total) * 100) + '%';
    const pr = this.uw.prison, ch = pr.ch && pr.ch.carry;
    $('jailPhone').textContent = ch ? `Carrying ${ch.kind === 'tray' ? 'a tray → serving counter' : ch.kind === 'trash' ? ch.n + ' litter → trash can' : 'laundry → carts'}` : j.phone ? 'Smuggled phone' : pr.callT > 0 ? `On the payphone: ${Math.ceil(pr.callT)}s` : 'No phone · no map';
    const mx = pr.maxSpeed(), nx = JAIL_SPEEDS.find(sp => sp.pts > j.gbp);
    $('jailGbp').textContent = `Good behaviour ${Math.floor(j.gbp)}${nx ? ' / ' + nx.pts : ''}`;
    for (const b of $('jailHud').querySelectorAll('[data-spd]')) { const x = +b.dataset.spd; b.disabled = x > mx; b.classList.toggle('on', x === (j.speed || 1)); }
    $('jailEmpire').classList.toggle('hidden', !pr.phone());
  }
  // ---------------------------------------------------------------- HUD bits
  update(rdt) {
    this.hudT -= rdt; if (this.hudT > 0) return; this.hudT = 0.25;
    const uw = this.uw, g = this.g;
    if (g.state !== 'playing' && g.state !== 'dead' && g.state !== 'busted') return;
    const c = units(uw.S.inv);
    const v = uw.nearVehicle(); const tr = v ? cargoC(v.trunk) : 0;
    const el = $('carry');
    const txt = c || tr ? `▣ ${c}${tr ? ' · trunk ' + fmtLb(tr) : ''}` : '';
    if (el.textContent !== txt) { el.textContent = txt; el.classList.toggle('hot', uw.carryHeat() > 6); }
    if (g.ui.modal === 'empireScreen' && uw.inJail) { this._rt = (this._rt || 0) - 1; if (this._rt <= 0) { this._rt = 4; this.render(); } }
  }
}

