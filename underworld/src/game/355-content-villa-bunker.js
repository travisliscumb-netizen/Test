/* =====================================================================
   [CONTENT] THE BUNKER UNDER VILLA VALEN (owner, 2026-11-17)
   Down in the lift from behind the library's bookcase (354), a scene change:
   - the lift lobby: the lift's doors open onto a concrete lobby and the
     bunker door, a 5 m steel slab that rolls aside;
   - the control room behind it: a wall of big screens, one for each part
     of the empire your phone has (money, empire, police, crew, business,
     market, property, stashes, garage, messages), live, and a command
     desk; walk up to a screen to open that app;
   - four rooms off it: the bedroom (sleep and save), the games room (the
     casino's slots and tables, the kart simulator), the vault (behind its
     own door: clean cash and dirty cash stacked on pallets as they grow,
     the $20,000,000 the house came with to start) and a spare room with
     the armoury bench, a second spare room through it.
   Money: the vault's clean cash is Money.vault (035), taken out to the bank
   or put in from it; its dirty cash is the villa's own stash (Money's
   'prop' place), so it is yours once you own the house.
   ===================================================================== */
const BUNKER = { W: 60, D: 48, H: 4.4, at: { x: -610, z: -1185 } };
// the screens in the control room: [app, x, z, facing (ry), width, height, y]
const BUNKER_SCREENS = [
  ['money', -3.5, -9.9, 0, 3.2, 1.7, 2.35], ['empire', 0.2, -9.9, 0, 3.2, 1.7, 2.35],
  ['police', -3.5, -9.9, 0, 3.2, 1.7, 0.55], ['crew', 0.2, -9.9, 0, 3.2, 1.7, 0.55],
  ['business', -13.9, -6, Math.PI / 2, 3.6, 1.9, 1.3], ['market', -13.9, 9.6, Math.PI / 2, 3.6, 1.9, 1.3],
  ['property', 13.9, -6, -Math.PI / 2, 3.6, 1.9, 1.3], ['stashes', 13.9, 9.6, -Math.PI / 2, 3.6, 1.9, 1.3],
  ['garage', -8.6, 13.9, Math.PI, 3.6, 1.9, 1.3], ['feed', 8.6, 13.9, Math.PI, 3.6, 1.9, 1.3]
];
const BUNKER_APP = { money: { name: 'Money', icon: '$', col: '#7fe08f', tab: 'overview' } };
function bunkerApp(id) { if (BUNKER_APP[id]) return BUNKER_APP[id]; const a = typeof PHONE_APPS !== 'undefined' && PHONE_APPS.find(q => q.id === id); return a ? { name: a.name, icon: a.icon, col: a.col, tab: a.tabs && a.tabs[0] && a.tabs[0][0] } : { name: id, icon: '', col: '#ffffff' }; }
// what each screen shows: a few big lines (label, value)
function bunkerLines(g, id) {
  const T = f => { try { const v = f(); return v === undefined || v === null || (typeof v === 'number' && !isFinite(v)) ? '—' : v; } catch (e) { return '—'; } };
  const uw = g.uw, P = typeof PROPS !== 'undefined' ? PROPS : [], owned = k => T(() => P.filter(p => p.kind === k && uw.props.owned(p.id)).length);
  switch (id) {
    case 'money': return [['Cash on you', T(() => fmtMoney(Money.onMe))], ['Bank (clean)', T(() => fmtMoney(Money.clean))], ['Vault (clean)', T(() => fmtMoney(Money.vault))], ['Dirty, stashed', T(() => fmtMoney(Money.dirtyTotal() - Money.onMe))]];
    case 'empire': return [['Rank', T(() => RANKS[uw.rank].name)], ['Rep', T(() => Math.round(g.save.rep).toLocaleString())], ['Influence', T(() => Math.round(uw.influence).toLocaleString())], ['Turf held', T(() => Object.values(uw.owner).filter(o => o === 'pc').length)]];
    case 'police': return [['Wanted', T(() => g.police.level ? '★'.repeat(g.police.level) : 'clear')], ['Heat', T(() => Math.round(uw.heat || 0))], ['Case file', T(() => (uw.legal && uw.legal.S && uw.legal.S.evidence ? Math.round(uw.legal.S.evidence) : 0) + ' evidence')]];
    case 'crew': return [['Crew', T(() => uw.crew.list.length)], ['Bodyguards', T(() => uw.crew.bodyguards().length)], ['On runs', T(() => uw.crew.list.filter(c => c.job && c.job !== 'idle').length)]];
    case 'business': return [['Businesses', owned('business')], ['Fronts', T(() => uw.fronts ? Object.keys(uw.fronts.S || {}).length : 0)], ['Warehouses', owned('warehouse')]];
    case 'market': return [['Product held', T(() => Math.round(Object.values(g.save.inv || {}).reduce((a, b) => a + (+b || 0), 0)).toLocaleString())], ['Day', T(() => uw.S.day)]];
    case 'property': return [['Homes', owned('safehouse')], ['Businesses', owned('business')], ['Warehouses', owned('warehouse')]];
    case 'stashes': return [['Dirty, everywhere', T(() => fmtMoney(Money.dirtyTotal()))], ['Carried', T(() => fmtMoney(Money.onMe))], ['In the vault', T(() => fmtMoney(Money.dirtyAtProp('villa')))]];
    case 'garage': return [['Cars', T(() => g.save.garage.length)], ['Stolen', T(() => g.save.stats.stolen)]];
    case 'feed': return [['Messages', T(() => g.save.messages.length)], ['Last', T(() => { const m = g.save.messages[g.save.messages.length - 1]; return m ? String(m.text).slice(0, 30) + (m.text.length > 30 ? '…' : '') : 'none'; })]];
  }
  return [];
}
function bunkerDrawScreen(S, g) {
  const c = S.ctx, W = c.canvas.width, H = c.canvas.height, A = bunkerApp(S.app), L = bunkerLines(g, S.app);
  const gr = c.createLinearGradient(0, 0, 0, H); gr.addColorStop(0, '#0d1420'); gr.addColorStop(1, '#070a10'); c.fillStyle = gr; c.fillRect(0, 0, W, H);
  c.fillStyle = A.col; c.fillRect(0, 0, W, 64); c.fillStyle = '#0b0d12'; c.font = 'bold 40px system-ui, sans-serif'; c.textBaseline = 'middle'; c.fillText(`${A.icon || ''}  ${A.name.toUpperCase()}`, 22, 34);
  c.font = '30px system-ui, sans-serif';
  L.forEach(([k, v], i) => {
    const y = 112 + i * 64; c.fillStyle = '#8fa3b8'; c.fillText(k, 24, y);
    c.fillStyle = '#f2f6fa'; c.font = 'bold 40px system-ui, sans-serif'; c.textAlign = 'right'; c.fillText(String(v), W - 24, y); c.textAlign = 'left'; c.font = '30px system-ui, sans-serif';
  });
  c.strokeStyle = A.col; c.lineWidth = 6; c.strokeRect(3, 3, W - 6, H - 6);
  S.tex.needsUpdate = true;
}
// the vault's cash on pallets: clean (green, white bands, a blue tag) on the west side, dirty (rubber-banded, a red tag)
// on the east, four rows a side; a pallet is $1,000,000 until there is more than sixteen pallets hold, then each holds
// more. Behind them the goods stored down here, one lane each, each its own look, growing with how much there is
const BUNKER_GOODS = {
  green: { per: 200, lb: true, bale: [0.6, 0.38, 0.45], col: 0x4f7a32, wrap: 0xcfe8c8, band: 0x2a3a1e },
  pills: { per: 100, lb: true, bale: [0.42, 0.3, 0.32], col: 0xf2f2f6, wrap: 0xe8eef8, band: 0x2a6fd6 },
  snow: { per: 100, lb: true, bale: [0.32, 0.12, 0.2], col: 0xf4f4f0, wrap: 0xe8e8e0, band: 0x8a6a3a },
  smokes: { per: 200, bale: [0.5, 0.26, 0.28], col: 0xc8a050, wrap: 0xd8b878, band: 0x7a1a1a },
  hardware: { per: 40, bale: [0.9, 0.36, 0.42], col: 0x4a5a3a, wrap: 0x5a6a48, band: 0x22262b },
  hot: { per: 200, bale: [0.45, 0.35, 0.45], col: 0x8a6a48, wrap: 0x9a7a58, band: 0xd8d0b8 }
};
function bunkerVaultKit(k, clean, dirty, goods) {
  const per = Math.max(1e6, Math.ceil(Math.max(clean, dirty) / 16 / 1e6) * 1e6);
  const side = (amt, x0, bills, band, tag) => {
    let n = Math.ceil(amt / per), left = amt;
    for (let i = 0; i < 16 && n > 0; i++, n--) {
      const col = i % 4, row = Math.floor(i / 4), x = x0 + col * 1.5, z = -12 - row * 1.45, f = Math.min(1, left / per); left -= per;
      k.box(x, 0, z, 1.2, 0.14, 1.0, 0x8a6a44); for (const dz of [-0.4, 0, 0.4]) k.box(x, 0, z + dz, 1.2, 0.02, 0.12, 0x6a5034);
      const layers = Math.max(1, Math.round(f * 5));
      for (let l = 0; l < layers; l++) for (let a = 0; a < 3; a++) for (let b = 0; b < 2; b++) {
        const bx = x - 0.4 + a * 0.4, bz = z - 0.24 + b * 0.48, by = 0.14 + l * 0.17;
        k.box(bx, by, bz, 0.37, 0.16, 0.45, bills); k.box(bx, by + 0.02, bz, 0.375, 0.12, 0.06, band); k.box(bx - 0.12, by + 0.02, bz, 0.04, 0.12, 0.455, band);
      }
      k.box(x + 0.45, 0.14 + layers * 0.17, z + 0.38, 0.22, 0.01, 0.14, tag);
    }
  };
  side(clean, 1.0, 0x5e8f62, 0xf2f2ee, 0x2a6fd6);
  side(dirty, 8.0, 0x5a6a42, 0xc04030, 0xd23a2a);
  // the goods: a lane each (x 1..13), up to three pallets deep from z -18.2, each pallet up to four layers of its bales
  GOOD_IDS.forEach((g, gi) => {
    const D = BUNKER_GOODS[g], lots = goods && goods[g] | 0; if (!D || !lots) return;
    const qty = typeof qtyOf === 'function' ? qtyOf(g, lots) : lots, x = 1.2 + gi * 2.25;
    let left = qty;
    for (let pz = 0; pz < 3 && left > 0; pz++) {
      const z = -18.4 - pz * 1.5, f = Math.min(1, left / D.per); left -= D.per;
      k.box(x, 0, z, 1.3, 0.14, 1.1, 0x8a6a44);
      const [bw, bh, bd] = D.bale, nx = Math.max(1, Math.floor(1.2 / (bw + 0.02))), nz = Math.max(1, Math.floor(1.0 / (bd + 0.02))), per = nx * nz, total = Math.max(1, Math.round(f * per * 4));
      for (let i = 0; i < total; i++) {
        const l = Math.floor(i / per), r = i % per, a = r % nx, b = Math.floor(r / nx);
        const bx = x - (nx - 1) * (bw + 0.02) / 2 + a * (bw + 0.02), bz = z - (nz - 1) * (bd + 0.02) / 2 + b * (bd + 0.02), by = 0.14 + l * (bh + 0.01);
        k.box(bx, by, bz, bw, bh, bd, (i + l) % 3 ? D.col : D.wrap); k.box(bx, by + bh * 0.4, bz, bw + 0.005, bh * 0.18, bd + 0.005, D.band);
      }
    }
    k.box(x, 2.6, -23.8, 1.6, 0.36, 0.04, 0x0b0d12); k.glow(x, 2.62, -23.77, 1.5, 0.3, 0.01, D.band, 1.4);
  });
}
function villaBunkerDef(owned) {
  const { W, D, H } = BUNKER, hw = W / 2, hd = D / 2;
  const CON = 0x8a8d90, CON2 = 0x74787c, STEEL = 0x5c6268, DARK = 0x22262b, GOLD = 0xd8b04a, YEL = 0xf2c230;
  const def = {
    id: 'villa_bunker', dynamic: true, name: 'The bunker under Villa Valen', w: W, d: D, h: H, seed: 9191, tier: 7,
    exit: { x: 0, z: 23 }, spawn: { x: 0, z: 22.6 }, spawnH: Math.PI, at: { ...BUNKER.at }, door: { ...VILLA_DOOR },
    propId: owned ? 'villa' : null, owned, noExit: true, bunker: true,
    build(k, rng) {
      k.room(W, D, H, { floor: 0x5a5e62, wall: CON, wall2: CON2, ceil: 0x6a6e72, trim: DARK, lights: [7, 5], lightC: 0xf2f6ff });
      k.tiles(W, D, 0x5a5e62, 0x52565a, 1.5);
      const full = (along, c, a, b) => iwall(k, along, c, a, b, 0, H, CON2);
      // ---------------------------------------------------------------- walls
      // the lift lobby (x -10..10, z 14..24); the dead space either side of it is solid rock
      full('z', -10, 14, hd); full('z', 10, 14, hd); k.box(-20, 0, 19, 20, H, 10, 0x6a6e72, { col: true }); k.box(20, 0, 19, 20, H, 10, 0x6a6e72, { col: true });
      // the bunker door's wall (z 14): the opening x -2.5..2.5, 3.7 high, a lintel over it
      k.box(-8.25, 0, 14, 11.5, H, 0.3, CON2, { col: true }); k.box(8.25, 0, 14, 11.5, H, 0.3, CON2, { col: true }); k.box(0, 3.7, 14, 5, H - 3.7, 0.3, CON2, { col: true });
      k.box(-22, 0, 14, 16, H, 0.3, CON2, { col: true }); k.box(22, 0, 14, 16, H, 0.3, CON2, { col: true });
      // the control room (x -14..14, z -10..14): the bedroom west, the games room east, the spare room and the vault north
      iwall(k, 'z', -14, -10, 14, 0, H, CON2, [[2, 5]]); iwall(k, 'z', 14, -10, 14, 0, H, CON2, [[2, 5]]);
      iwall(k, 'x', -10, -14, 14, 0, H, CON2, [[-9, -6], [4.2, 8.8]]); // (the spare room's door; the vault's opening, its door in front of it)
      full('x', -10, -hw, -14); full('z', 14, -hd, -10); full('z', 0, -hd, -10);
      iwall(k, 'z', -14, -hd, -10, 0, H, CON2, [[-18, -15]]); // spare A | spare B
      // ---------------------------------------------------------------- the lift lobby
      k.box(0, 0.01, 19, 20, 0.01, 10, 0x4a4e52, { flat: true });
      // the lift car (x -1.8..1.8, z 21..24): steel panels, a handrail, a light; its doors (movers) at z 21
      for (const sx of [-1.8, 1.8]) k.box(sx, 0, 22.5, 0.12, 2.9, 3, 0xb4b9bf, { col: true });
      k.box(-1.3, 0, 21, 1.0, 2.9, 0.14, 0xb4b9bf, { col: true }); k.box(1.3, 0, 21, 1.0, 2.9, 0.14, 0xb4b9bf, { col: true }); k.box(0, 2.4, 21, 3.6, 0.5, 0.14, 0xb4b9bf);
      k.box(0, 2.9, 22.5, 3.6, 0.1, 3, 0x9a9fa5); k.glow(0, 2.86, 22.5, 1.6, 0.03, 1.6, 0xfff4dc, 2.2);
      k.box(0, 0.9, 23.85, 3.2, 0.06, 0.06, 0xd8dcdf); k.box(1.62, 1.0, 22.2, 0.06, 0.5, 0.3, DARK); k.glow(1.6, 1.15, 22.2, 0.02, 0.08, 0.08, 0x8fe39b, 2.4);
      k.glow(0, 2.65, 20.92, 0.6, 0.12, 0.02, 0xffd84d, 1.6);
      // hazard paint round the bunker door's frame, warning lights, a stencil
      for (let i = 0; i < 10; i++) { k.box(-2.7, i * 0.37, 14.17, 0.25, 0.37, 0.04, i % 2 ? YEL : DARK); k.box(2.7, i * 0.37, 14.17, 0.25, 0.37, 0.04, i % 2 ? DARK : YEL); }
      for (let i = 0; i < 14; i++) k.box(-2.6 + i * 0.4, 3.7, 14.17, 0.4, 0.25, 0.04, i % 2 ? YEL : DARK);
      for (const sx of [-3.4, 3.4]) { k.box(sx, 3.3, 14.2, 0.3, 0.3, 0.12, DARK); k.glow(sx, 3.35, 14.28, 0.2, 0.2, 0.04, 0xff3a2a, 2.0); }
      k.box(-6.5, 0, 15.2, 1.6, 0.9, 0.6, STEEL, { col: true }); k.glow(-6.5, 1.0, 15.0, 1.2, 0.4, 0.02, 0x46d4c4, 1.2);
      FURN.plant(k, -9.2, 0, 23.2, 1.1); FURN.plant(k, 9.2, 0, 23.2, 1.1);
      // ---------------------------------------------------------------- the control room
      k.box(0, 0.012, 2, 28, 0.01, 24, 0x2a2e33, { flat: true });
      FURN.rug(k, 0, 0, 1, 12, 8, 0x1a2a3a, 0x22344a);
      // the screen wall's frames (the screens themselves are drawn live, afterInstall)
      for (const [app, x, z, ry, w, h, y] of BUNKER_SCREENS) { const ax = Math.abs(Math.sin(ry)) < 0.5; k.box(x + (ax ? 0 : Math.sin(ry) * 0.04), y - 0.08, z + (ax ? Math.cos(ry) * 0.04 : 0), ax ? w + 0.16 : 0.08, h + 0.16, ax ? 0.08 : w + 0.16, 0x0b0d12); void app; }
      // the command desk: a long curved run of desks facing the screen wall, chairs, monitors, the island on a lit table
      for (let i = -2; i <= 2; i++) { const x = -1.6 + i * 2.2, z = -5.4 + Math.abs(i) * 0.5; k.box(x, 0, z, 2.1, 0.78, 0.9, DARK, { col: true }); k.box(x, 0.78, z, 2.15, 0.05, 0.95, 0x3a4048); k.box(x, 0.83, z - 0.25, 0.9, 0.5, 0.05, 0x0b0d12); k.glow(x, 0.86, z - 0.22, 0.82, 0.42, 0.01, [0x2a5fa8, 0x2f8a4a, 0xa83a2a, 0x2a5fa8, 0x6a3a8a][i + 2], 1.4); k.box(x, 0, z + 1.0, 0.55, 0.5, 0.55, 0x1a1c20); k.box(x, 0.5, z + 1.25, 0.55, 0.6, 0.08, 0x1a1c20); }
      k.box(-1.6, 0, 3.5, 4.6, 0.85, 2.8, DARK, { col: true }); k.glow(-1.6, 0.86, 3.5, 4.3, 0.02, 2.5, 0x1f5f8a, 1.3);
      for (let i = 0; i < 9; i++) k.box(-3.4 + (i % 3) * 1.2 + (i * 0.37 % 0.4), 0.9, 2.6 + Math.floor(i / 3) * 0.8, 0.5, 0.12 + (i % 4) * 0.08, 0.4, 0x8fb4dc);
      FURN.sofa(k, -9, 0, 12.6, 2, 3.2, 0x2a2e33); FURN.sofa(k, 9, 0, 12.6, 2, 3.2, 0x2a2e33);
      // the computer: a workstation with a tower and two monitors, the dark web on one of them
      k.box(7, 0, 7.6, 2.2, 0.76, 0.9, 0x1a1c20, { col: true }); k.box(7, 0.76, 7.6, 2.25, 0.04, 0.95, 0x3a4048);
      for (const dx of [-0.5, 0.5]) { k.box(7 + dx, 0.8, 7.3, 0.9, 0.56, 0.05, 0x0b0d12); k.glow(7 + dx, 0.83, 7.33, 0.84, 0.5, 0.01, dx < 0 ? 0x1f8a3a : 0x2a5fa8, 1.6); }
      k.box(8.3, 0, 7.6, 0.25, 0.5, 0.5, 0x1a1c20); k.glow(8.3, 0.4, 7.86, 0.04, 0.04, 0.01, 0x8fe39b, 2.4); k.box(7, 0.8, 7.85, 0.6, 0.02, 0.2, 0x22262b);
      k.box(7, 0, 8.7, 0.6, 0.48, 0.6, 0x1a1a1e); k.box(7, 0.48, 9.0, 0.6, 0.7, 0.1, 0x1a1a1e);
      for (const [x, z] of [[-12.6, -8.6], [12.6, -8.6], [-12.6, 12.6], [12.6, 12.6]]) FURN.plant(k, x, 0, z, 1.2);
      for (const [x, z] of [[-6, -2], [6, -2], [-6, 8], [6, 8]]) FURN.ceilingLight(k, x, H, z, 1.6);
      // the vault door's frame
      for (let i = 0; i < 9; i++) { k.box(3.85, i * 0.38, -9.8, 0.25, 0.38, 0.04, i % 2 ? YEL : DARK); k.box(9.15, i * 0.38, -9.8, 0.25, 0.38, 0.04, i % 2 ? DARK : YEL); }
      k.glow(6.5, 3.55, -9.8, 3.2, 0.3, 0.04, 0xffd84d, 1.6);
      // ---------------------------------------------------------------- the bedroom (x -30..-14, z -10..14)
      k.box(-22, 0.012, 2, 16, 0.01, 24, 0x3a3230, { flat: true });
      FURN.rug(k, -22, 0, 1, 7, 6, 0x22304a, 0x2a3a5a);
      FURN.bed(k, -28.4, 0, 1, 1, 2.4, 2.6, 0x22304a, 0x1a1c20); FURN.nightstand(k, -29.6, 0, -1.4, 1); FURN.nightstand(k, -29.6, 0, 3.4, 1);
      FURN.tv(k, -14.4, 0.6, 1, 3, 2.4, false); k.box(-14.6, 0, 1, 0.5, 0.6, 2.8, 0x1a1c20, { col: true });
      FURN.wardrobe(k, -22, 0, -9.6, 0, 2.4, 0x3a3f46); FURN.wardrobe(k, -18.6, 0, -9.6, 0, 2.4, 0x3a3f46);
      FURN.sofa(k, -20, 0, 11.6, 2, 2.6, 0x6a3a3a); FURN.coffeeTable(k, -20, 0, 9.8, 0, 1.2, 0.7); FURN.lamp(k, -29.4, 0, 12.6); FURN.plant(k, -15, 0, 12.8, 1.2); FURN.plant(k, -29.3, 0, -9, 1.0);
      FURN.art(k, -29.9, 1.6, 1, Math.PI / 2, 2.6, 1.3, 0x2a5f9e);
      FURN.ceilingLight(k, -22, H, 1, 1.6); FURN.ceilingLight(k, -22, H, 9, 1.2);
      // ---------------------------------------------------------------- the games room (x 14..30, z -24..14)
      k.box(22, 0.012, -5, 16, 0.01, 38, 0x2a1a2a, { flat: true });
      for (let i = 0; i < 4; i++) { const z = -20 + i * 3.4; k.box(29, 0, z, 1.2, 1.8, 1.0, [0x7a1a2a, 0x1a3a6a, 0x5a2a7a, 0x7a5a1a][i], { col: true }); k.glow(28.38, 1.1, z, 0.02, 0.62, 0.72, [0xff4d5e, 0x46d4c4, 0xd28cff, 0xffd84d][i], 1.8); k.box(28.3, 0.7, z, 0.25, 0.08, 0.7, 0xd8b04a); k.glow(29, 1.82, z, 1.0, 0.12, 0.8, 0xffd84d, 2.0); }
      const table = (x, z, felt, w = 2.6, d = 1.3) => { k.box(x, 0, z, w, 0.82, d, 0x3a2416, { col: true }); k.box(x, 0.82, z, w + 0.1, 0.06, d + 0.1, felt); k.box(x, 0.84, z, w - 0.3, 0.05, d - 0.3, felt); for (let i = 0; i < 4; i++) k.box(x - w / 2 + 0.4 + i * (w - 0.8) / 3, 0, z + d / 2 + 0.55, 0.42, 0.62, 0.42, 0x1a1a1e); };
      table(19, -18, 0x1f6a3a); table(19, -11, 0x7a1a2a); table(24, -4, 0x1f4a6a, 3.2, 1.8);
      k.cyl(19, 0.88, -11, 0.45, 0.45, 0.06, 0x2a2420, 18); k.cyl(19, 0.94, -11, 0.08, 0.04, 0.18, GOLD, 8);
      // the kart simulator: a cockpit seat, a wheel, three wrap-round screens
      k.box(19, 0, 8, 1.6, 0.35, 2.4, DARK, { col: true }); k.box(19, 0.35, 8.8, 0.8, 0.6, 0.6, 0x7a1a1a); k.box(19, 0.35, 9.1, 0.8, 1.0, 0.15, 0x7a1a1a);
      k.box(19, 0.35, 7.6, 0.12, 0.6, 0.12, 0x2a2c30); k.cyl(19, 0.95, 7.55, 0.2, 0.2, 0.05, 0x1a1c20, 14);
      for (const [dx, dz, w] of [[0, 6.5, 2.2], [-1.4, 7.0, 1.4], [1.4, 7.0, 1.4]]) { k.box(19 + dx, 0.9, dz, w, 1.2, 0.08, 0x0b0d12); k.glow(19 + dx, 0.96, dz + 0.05, w - 0.12, 1.08, 0.01, 0x2f8a4a, 1.6); }
      k.glow(19, 2.6, 6.4, 3.2, 0.3, 0.05, 0xff8a3d, 1.8);
      FURN.bar(k, 27.4, 0, 11.2, 3, 3.2, 3); FURN.arcade(k, 15, 0, -22.8, 0, 0xd23a2a); FURN.arcade(k, 16.2, 0, -22.8, 0, 0x6a3a8a);
      FURN.sofa(k, 24, 0, 12.8, 2, 3.0, 0x6a1a2a); FURN.plant(k, 14.8, 0, 12.8, 1.2); FURN.plant(k, 29.2, 0, -23.2, 1.2);
      for (const [x, z] of [[20, -16], [20, -6], [22, 4], [24, 10]]) FURN.ceilingLight(k, x, H, z, 1.4);
      // ---------------------------------------------------------------- the vault (x 0..14, z -24..-10)
      k.box(7, 0.012, -17, 14, 0.01, 14, 0x3a3e42, { flat: true });
      // shelves of gold along the north wall, a counting table
      for (let s = 0; s < 3; s++) { const x = 2.4 + s * 4.6; k.box(x, 0, -23.5, 3.8, 2.4, 0.6, STEEL, { col: true }); for (let r = 0; r < 3; r++) { k.box(x, 0.5 + r * 0.7, -23.3, 3.7, 0.04, 0.55, 0x8a9096); for (let i = 0; i < 9; i++) for (let j = 0; j < 2; j++) k.box(x - 1.6 + i * 0.4, 0.54 + r * 0.7 + j * 0.09, -23.45 + (i % 2) * 0.15, 0.32, 0.09, 0.16, j ? 0xf2c94c : 0xd8a227); } }
      // (a counting cart in the corner, clear of the door and the aisle between the pallets)
      k.box(13.2, 0, -11, 1.0, 0.85, 0.8, DARK, { col: true }); k.box(13.2, 0.85, -11, 1.05, 0.04, 0.85, 0x3a4048); k.box(13.2, 0.89, -11, 0.5, 0.3, 0.4, 0x8a9096); k.glow(13.2, 1.0, -10.8, 0.3, 0.12, 0.01, 0x8fe39b, 2.0);
      for (const [x, z] of [[3.5, -17], [10.5, -17]]) FURN.ceilingLight(k, x, H, z, 1.6);
      k.glow(4, 3.2, -23.85, 2.4, 0.3, 0.02, 0x2a6fd6, 1.4); k.glow(11, 3.2, -23.85, 2.4, 0.3, 0.02, 0xd23a2a, 1.4);
      // ---------------------------------------------------------------- spare room A (x -14..0): the armoury bench; spare room B beyond
      // the armoury: gun racks along the north and west walls (rifles and pistols on pegboard), ammo crates, vests on
      // stands, the bench in the middle
      k.box(-7, 0.012, -17, 14, 0.01, 14, 0x3a3e42, { flat: true });
      for (const [x0, len] of [[-13.4, 6], [-6.6, 6]]) {
        k.box(x0 + len / 2, 0.4, -23.8, len, 2.6, 0.08, 0x3a3a34); for (let i = 0; i < 28; i++) k.box(x0 + 0.2 + (i % 14) * 0.42, 0.6 + Math.floor(i / 14) * 1.0, -23.74, 0.02, 0.02, 0.02, 0x8a8a80);
        for (let i = 0; i < 7; i++) { const x = x0 + 0.5 + i * 0.85; k.box(x, 1.55, -23.68, 0.12, 0.95, 0.08, 0x1a1c1e); k.box(x, 2.3, -23.68, 0.06, 0.4, 0.06, 0x1a1c1e); k.box(x + 0.06, 1.3, -23.64, 0.08, 0.28, 0.1, 0x5a3a24); }
        for (let i = 0; i < 6; i++) { const x = x0 + 0.6 + i * 0.95; k.box(x, 0.75, -23.68, 0.32, 0.12, 0.06, 0x22262b); k.box(x - 0.1, 0.62, -23.68, 0.08, 0.16, 0.06, 0x22262b); }
      }
      for (let r = 0; r < 4; r++) { k.box(-13.8, 0.3, -21.5 + r * 2.2, 0.08, 2.6, 1.8, 0x3a3a34); for (let i = 0; i < 3; i++) k.box(-13.7, 1.4 + (i - 1) * 0.7, -21.5 + r * 2.2, 0.1, 0.12, 1.4, 0x1a1c1e); }
      k.box(-7, 0, -17, 3.4, 0.9, 1.3, 0x5a4a38, { col: true }); k.box(-7, 0.9, -17, 3.5, 0.05, 1.4, 0x3a3f45);
      for (let i = 0; i < 3; i++) k.box(-7.9 + i * 0.9, 0.95, -17, 0.7, 0.08, 0.2, 0x1a1c1e);
      for (let i = 0; i < 8; i++) k.box(-2.2 + (i % 2) * 0.9, Math.floor(i / 2) * 0.5, -22.6 + (i % 3) * 0.1, 0.8, 0.48, 0.5, i % 2 ? 0x4a5a3a : 0x5a6a48, { col: true });
      for (const z of [-13.4, -15.2, -17.0]) { k.box(-1.0, 0, z, 0.4, 1.0, 0.4, 0x2a2c30, { col: true }); k.box(-1.0, 1.0, z, 0.55, 0.65, 0.3, 0x2a3a2a); k.box(-1.0, 1.65, z, 0.2, 0.15, 0.2, 0x2a2c30); }
      k.glow(-7, 3.3, -23.85, 3.0, 0.3, 0.02, 0xff8a3d, 1.4);
      FURN.ceilingLight(k, -7, H, -17, 1.4); FURN.ceilingLight(k, -22, H, -17, 1.2);
    },
    // the moving parts: the lift's two doors, the bunker door, the vault door
    movers: [
      { id: 'liftL', off: [-0.75, 0, 0], dur: 1.0, build(k) { k.box(-0.4, 0, 21.05, 0.8, 2.4, 0.06, 0xc8ccd0, { col: true }); k.box(-0.4, 2.0, 21.09, 0.02, 0.02, 0.02, 0xc8ccd0); } },
      { id: 'liftR', off: [0.75, 0, 0], dur: 1.0, build(k) { k.box(0.4, 0, 21.05, 0.8, 2.4, 0.06, 0xc8ccd0, { col: true }); } },
      { id: 'bdoor', off: [5.4, 0, 0], dur: 3.6, sound: 'thud', build(k) {
        k.box(0, 0, 14.55, 5.3, 3.75, 0.8, 0x6a7076, { col: true });
        k.box(0, 0.3, 14.98, 4.8, 3.1, 0.06, 0x7c8288);
        for (let i = 0; i < 4; i++) k.box(0, 0.5 + i * 0.85, 15.02, 4.9, 0.12, 0.05, 0x5a6066);
        for (const sx of [-2.35, 2.35]) for (let i = 0; i < 6; i++) k.cyl(sx, 0.4 + i * 0.58, 15.0, 0.07, 0.07, 0.06, 0xb4b9bf, 8);
        k.box(0, 1.6, 15.06, 0.14, 0.14, 0.14, 0x3a3f45); k.cyl(0, 1.48, 15.12, 0.62, 0.62, 0.08, 0xb4b9bf, 20);
        for (let s = 0; s < 3; s++) { const a = s * Math.PI / 3; k.box(Math.cos(a) * 0.01, 1.52, 15.18, 1.3 * Math.abs(Math.cos(a)) + 0.06, 0.06, 0.06, 0xd8dcdf); }
        k.glow(1.8, 2.9, 15.0, 0.16, 0.16, 0.04, 0x8fe39b, 2.0);
      } },
      { id: 'vdoor', off: [5.0, 0, 0], dur: 2.6, sound: 'thud', build(k) {
        k.box(6.5, 0, -9.6, 5.0, 3.4, 0.5, 0x8a9096, { col: true });
        k.cyl(6.5, 1.5, -9.33, 1.1, 1.1, 0.06, 0x9aa0a6, 28); k.cyl(6.5, 1.5, -9.28, 0.18, 0.18, 0.14, 0xd8b04a, 12);
        for (let s = 0; s < 3; s++) k.box(6.5, 1.47, -9.2, 1.6, 0.06, 0.06, 0xd8dcdf);
        for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; k.cyl(6.5 + Math.cos(a) * 1.35, 1.5 + Math.sin(a) * 1.35, -9.34, 0.08, 0.08, 0.05, 0xc8ccd0, 8); }
      } }
    ],
    afterInstall(grp, def) {
      // the live screens: a canvas each, drawn now and then once a second while you are down here
      def.screens = BUNKER_SCREENS.map(([app, x, z, ry, w, h, y]) => {
        const cv = document.createElement('canvas'); cv.width = 768; cv.height = Math.round(768 * h / w);
        const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
        const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }));
        m.position.set(x + Math.sin(ry) * 0.12, y + h / 2, z + Math.cos(ry) * 0.12); m.rotation.y = ry; grp.add(m);
        return { app, ctx: cv.getContext('2d'), tex, mesh: m };
      });
      def.cashKey = ''; def.cashMat = grp.children[0].material; def.grp = grp;
    },
    tick(dt, g) {
      def.scrT = (def.scrT || 0) - dt;
      if (def.scrT <= 0) { def.scrT = 1; for (const S of def.screens) bunkerDrawScreen(S, g); }
      // the vault's pallets follow what is in it
      const clean = Money.vault, dirty = Money.dirtyAtProp('villa'), goods = g.uw && g.uw.S.storage.villa || {}, key = Math.round(clean / 1e5) + ':' + Math.round(dirty / 1e5) + ':' + GOOD_IDS.map(k => goods[k] | 0).join(',');
      if (key !== def.cashKey) {
        def.cashKey = key;
        if (def.cashMesh) { def.grp.remove(def.cashMesh); def.cashMesh.geometry.dispose(); }
        const kk = new InteriorKit(H); bunkerVaultKit(kk, clean, dirty, goods); const pr = kk.build();
        def.cashMesh = new THREE.Mesh(pr.main.geometry, def.cashMat); def.cashMesh.frustumCulled = false; def.grp.add(def.cashMesh);
      }
      // the spots that change with the doors
      const I = g.content.interiors, sp = id => def.spots.find(s => s.id === id), M = id => I.mover(def, id);
      const bd = M('bdoor'), vd = M('vdoor'), lift = M('liftL');
      sp('v:bdoor').label = bd.t === bd.want ? (bd.t ? 'Close the bunker door' : 'Open the bunker door') : '';
      sp('v:bdoor2').label = sp('v:bdoor').label;
      sp('v:vdoor').label = vd.t === vd.want ? (vd.t ? 'Lock the vault' : 'Open the vault') : '';
      sp('v:up').label = lift.t === 1 && lift.want === 1 ? 'Lift · up to the house' : '';
    }
  };
  def.spots = [
    { id: 'v:up', x: 0, z: 22.7, r: 1.0, label: '' },
    { id: 'v:bdoor', x: -3.4, z: 15.6, r: 1.5, label: 'Open the bunker door' },
    { id: 'v:bdoor2', x: -3.4, z: 12.6, r: 1.5, label: '' },
    { id: 'v:vdoor', x: 2.6, z: -8.6, r: 1.4, label: 'Open the vault' },
    { id: 'v:cash', x: 6.75, z: -12.2, r: 1.5, label: 'The vault · clean and dirty cash' },
    { id: 'v:goods', x: 6.75, z: -17.4, r: 1.4, label: 'The vault · goods' },
    { id: 'v:pc', x: 7, z: 9.4, r: 1.3, label: 'The computer · dark web, property, the empire' },
    { id: 'v:armory', x: -7, z: -15.6, r: 1.6, label: 'The armoury · guns, ammo, vests' },
    { id: 'v:kart', x: 19, z: 10.2, r: 1.4, label: 'Kart simulator · Valen Kart Park, six karts, three laps' },
    { id: 'g:slot:royale', x: 27.6, z: -20, r: 1.2, label: 'Royale Billions' }, { id: 'g:slot:royale', x: 27.6, z: -16.6, r: 1.2, label: 'Royale Billions' },
    { id: 'g:slot:royale', x: 27.6, z: -13.2, r: 1.2, label: 'Royale Billions' }, { id: 'g:slot:royale', x: 27.6, z: -9.8, r: 1.2, label: 'Royale Billions' },
    { id: 'g:bj:0', x: 19, z: -16.2, r: 1.3, label: 'Blackjack' }, { id: 'g:roul:0', x: 19, z: -9.2, r: 1.3, label: 'Roulette' }, { id: 'g:poker:0', x: 24, z: -1.6, r: 1.5, label: 'Hold’em · choose your stakes' },
    { id: 'bar', x: 26.2, z: 11.2, r: 1.4, label: 'Mix a drink' }
  ];
  for (const [app, x, z, ry] of BUNKER_SCREENS) { const A = bunkerApp(app); def.spots.push({ id: 'v:scr:' + app, x: x + Math.sin(ry) * 1.6, z: z + Math.cos(ry) * 1.6, r: 1.3, label: `${A.name} · open on the big screen` }); }
  if (owned) def.spots.push({ id: 'bed', x: -26, z: 1, r: 1.8, label: 'Sleep & save' }, { id: 'tv', x: -16.6, z: 1, r: 1.6, label: 'Watch the news' });
  return def;
}
const VillaBunker = {
  // the vault comes with the $20,000,000 the house was built with (once per game: a save that already took it from the
  // old closet panel has it in the bank)
  ensureVault(g) { Money.vaultSeed(VillaValen.taken(g) ? 0 : VillaValen.CACHE); },
  // clean cash into the vault from the bank, and out of it to the bank
  toVault(n) { const m = Math.min(Math.round(n * 100) / 100, Money.clean); if (!(m > 0) || !Money.pay(m, 'vaultIn')) return 0; Money.vaultAdj(m); return m; },
  fromVault(n) { const m = Math.min(Math.round(n * 100) / 100, Money.vault); if (!(m > 0)) return 0; Money.vaultAdj(-m); Money.earn(m, 'vaultOut'); return m; },
  arrive(g, def) {
    const I = g.content.interiors;
    I.move(def, 'liftL', false, null, true); I.move(def, 'liftR', false, null, true);
    setTimeout(() => { if (I.cur === def) { I.move(def, 'liftL', true); I.move(def, 'liftR', true); g.audio.play('ui'); } }, 600);
  },
  spot(g, id) {
    const I = g.content.interiors, def = I.cur; if (!def || !def.bunker) return false;
    if (id.startsWith('scr:')) { const A = bunkerApp(id.slice(4)); if (g.uw && A.tab) g.uw.ui.open(A.tab); g.audio.play('ui'); return true; }
    switch (id) {
      case 'up': I.move(def, 'liftL', false); I.move(def, 'liftR', false, () => VillaValen.enterHouse(g, 'lift')); g.audio.play('ui'); return true;
      case 'bdoor': case 'bdoor2': { const M = I.mover(def, 'bdoor'); I.move(def, 'bdoor', !(M.want > 0)); return true; }
      case 'vdoor': { const M = I.mover(def, 'vdoor'); I.move(def, 'vdoor', !(M.want > 0)); return true; }
      case 'cash': this.cashMenu(g); return true;
      case 'goods': if (VillaValen.owned(g)) g.uw.ui.openProp('villa'); else g.ui.toast('Buy the house to keep goods down here.'); return true;
      case 'armory': this.armoryMenu(g); return true;
      case 'pc': this.computer(g, 'web'); return true;
      case 'kart': if (!g.kart) g.kart = new KartSim(g); g.kart.start(); return true;
    }
    return false;
  },
  // the armoury: every gun on the racks, always (take any of them), ammunition for what you carry, a fresh vest
  armoryMenu(g) {
    const C = g.content, s = g.save, p = g.player, guns = WEAPONS.filter(w => w.id !== 'fists');
    const fill = w => { if (!w.melee) s.ammo[w.id] = Math.max(s.ammo[w.id] | 0, (w.mag || 10) * 8); };
    const acts = {
      all: () => { for (const w of guns) { s.weapons[w.id] = 1; s.wloc[w.id] = null; fill(w); } return true; },
      ammo: () => { for (const w of guns) if (s.weapons[w.id]) fill(w); return true; },
      vest: () => { p.vest = VEST_MAX; p.health = p.maxHealth; return true; }
    };
    for (const w of guns) acts['g:' + w.id] = () => { s.weapons[w.id] = 1; s.wloc[w.id] = null; fill(w); return true; };
    const render = () => `<div class="btns">${'<button class="sbtn gold" data-act="all">Take one of everything</button><button class="sbtn" data-act="ammo">Fill up on ammunition</button><button class="sbtn" data-act="vest">Strap on a vest, patch up</button>'}</div>
      <h3>The racks</h3><div class="btns">${guns.map(w => `<button class="sbtn" data-act="g:${w.id}">${w.name}${s.weapons[w.id] && (s.wloc[w.id] || null) === null ? ' · on you' : ''}</button>`).join('')}</div>
      <div class="hint">The racks are always full. Ammo: ${guns.filter(w => !w.melee && s.weapons[w.id]).map(w => `${w.name} ${(s.ammo[w.id] | 0) + (p.mag[w.id] | 0)}`).join(' · ') || 'none carried'}</div>`;
    C.openSvc('The armoury', 'Guns on every wall, crates of rounds, vests on their stands.', render, act => { const f = acts[act]; if (f && f()) g.audio.play('pickup'); C.refreshSvc(); });
  },
  // the computer: the dark web (bulk product delivered to the vault), property bought online, every app of the empire
  computer(g, tab) {
    const C = g.content, uw = g.uw, own = () => VillaValen.owned(g);
    const LB = [10, 50, 100, 250, 500], items = GOOD_IDS.filter(k => k !== 'hot');
    // (bulk: a pound of anything at 85% of its street base; paid from your vaults, stashes, then what you carry)
    const unitPrice = k => Math.round(GOODS[k].base * 0.85);
    const lotsOf = (k, lb) => GOOD_UNIT[k][0] === 'lb' ? lotsFor(k, lb) : lb;
    const room = () => uw.props.storageFree('villa');
    const buyGoods = (k, lb) => {
      if (!own()) { C.refreshSvc('Buy the house first: the deliveries come down to its vault.'); return; }
      const n = Math.min(lotsOf(k, lb), Math.floor(room() / GOODS[k].size)); if (n <= 0) { C.refreshSvc('The vault is full.'); return; }
      const cost = n * unitPrice(k);
      if (!Money.can(cost, 'importOrder')) { C.refreshSvc(`That is ${fmtMoney(cost)}, and your stashes and pockets don’t hold it.`); return; }
      Money.pay(cost, 'importOrder'); const st = uw.S.storage.villa || (uw.S.storage.villa = {}); Inv.add(st, k, n, cost);
      g.audio.play('cash'); C.refreshSvc(`${fmtQty(k, n)} of ${GOODS[k].name} on its way down: ${fmtMoney(cost)}, paid. It is in the vault.`);
    };
    const render = () => {
      const tabs = [['web', 'Dark web'], ['prop', 'Property'], ['apps', 'The empire']].map(([t, n]) => `<button class="sbtn${t === tab ? ' gold' : ''}" data-act="tab:${t}">${n}</button>`).join('');
      let h = `<div class="btns">${tabs}</div>`;
      if (tab === 'web') {
        const st = uw.S.storage.villa || {};
        h += `<div class="stats"><span>Vault space</span><span>${room().toLocaleString()} lots free</span><span>You can pay</span><span>${fmtMoney(Money.dirtyTotal())} dirty</span></div>`;
        for (const k of items) h += `<h3>${GOODS[k].name} · ${GOOD_UNIT[k][0] === 'lb' ? fmtMoney(Math.round(unitPrice(k) / GOOD_UNIT[k][2])) + ' a pound' : fmtMoney(unitPrice(k)) + ' a ' + GOOD_UNIT[k][0]} · in the vault ${fmtQty(k, Inv.has(st, k))}</h3><div class="btns">${LB.map(lb => `<button class="sbtn" data-act="buy:${k}:${lb}" ${own() ? '' : 'disabled'}>${GOOD_UNIT[k][0] === 'lb' ? lb + ' lb' : lb}</button>`).join('')}</div>`;
        if (!own()) h += '<div class="hint">Deliveries come down to the vault: buy Villa Valen first.</div>';
      } else if (tab === 'prop') {
        const list = PROPS.filter(d => !uw.props.owned(d.id)).sort((a, b) => b.price - a.price);
        h += `<div class="stats"><span>Your bank</span><span>${fmtMoney(Money.clean)}</span></div>` + list.map(d => `<div class="row"><span>${d.name} · ${d.type || d.kind}</span> <button class="sbtn" data-act="prop:${d.id}" ${Money.can(uw.props.price(d), 'property') ? '' : 'disabled'}>${fmtMoney(uw.props.price(d))}</button></div>`).join('');
      } else {
        h += `<div class="btns">${PHONE_APPS.filter(a => a.tabs).map(a => `<button class="sbtn" data-act="app:${a.tabs[0][0]}">${a.icon} ${a.name}</button>`).join('')}</div>`;
      }
      return h;
    };
    C.openSvc('The computer', 'Encrypted, untraceable, always on.', render, act => {
      const [a, b, c] = act.split(':');
      if (a === 'tab') { tab = b; C.refreshSvc(); }
      else if (a === 'buy') buyGoods(b, +c);
      else if (a === 'prop') { const msg = uw.props.buy(b); C.refreshSvc(msg || `${PROP_BY_ID[b].name} is yours. Bought online.`); }
      else if (a === 'app') uw.ui.open(b);
    });
  },
  // the vault: clean cash to and from the bank (anyone who found it may take it; putting cash in is the owner's);
  // dirty cash to and from the villa's stash (the owner's)
  cashMenu(g) {
    this.ensureVault(g);
    if (!g.save.secrets.villacache) g.content.secret('villacache');
    const C = g.content, own = () => VillaValen.owned(g);
    const acts = {
      c1: () => this.fromVault(1e6), call: () => this.fromVault(Money.vault),
      p1: () => this.toVault(1e6), pall: () => this.toVault(Money.clean),
      dput: () => Money.move({ key: 'inv' }, { prop: 'villa' }, Money.onMe),
      d1: () => Money.move({ prop: 'villa' }, { key: 'inv' }, 1e5), dall: () => Money.move({ prop: 'villa' }, { key: 'inv' }, Money.dirtyAtProp('villa'))
    };
    const btn = (id, label, ok) => `<button class="sbtn${ok ? ' gold' : ''}" data-act="${id}" ${ok ? '' : 'disabled'}>${label}</button>`;
    const render = () => {
      const o = own(), dirty = Money.dirtyAtProp('villa');
      return `<div class="stats"><span>Clean cash</span><span>${fmtMoney(Money.vault)}</span><span>Dirty cash</span><span>${fmtMoney(dirty)}</span><span>Your bank</span><span>${fmtMoney(Money.clean)}</span><span>Carried</span><span>${fmtMoney(Money.onMe)}</span></div>
        <h3>Clean</h3><div class="btns">${btn('c1', 'Take $1,000,000 to the bank', Money.vault > 0)}${btn('call', 'Take it all to the bank', Money.vault > 0)}${btn('p1', 'Put $1,000,000 in from the bank', o && Money.clean > 0)}${btn('pall', 'Put the whole bank in', o && Money.clean > 0)}</div>
        <h3>Dirty</h3><div class="btns">${btn('dput', 'Put what you carry in', o && Money.onMe > 0)}${btn('d1', 'Take $100,000', o && dirty > 0)}${btn('dall', 'Take it all', o && dirty > 0)}</div>
        ${o ? '' : '<div class="hint">The clean cash is yours to take. Buy the house to keep cash down here.</div>'}`;
    };
    C.openSvc('The vault', 'Pallets of cash: clean on the left, dirty on the right.', render, act => { const f = acts[act]; if (f && f()) g.audio.play('cash'); C.refreshSvc(); });
  }
};
