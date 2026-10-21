/* =====================================================================
   [CORE] BOOT
   ===================================================================== */
(async () => {
  const fill = $('loadfill'), txt = $('loadtext');
  const progress = (k, t) => { fill.style.width = Math.round(k * 100) + '%'; txt.textContent = t; };
  try {
    const test = document.createElement('canvas');
    if (!(test.getContext('webgl2') || test.getContext('webgl'))) throw new Error('WebGL is not available in this browser.');
    game = new Game();
    window.game = game;
    // debug/test namespace (module-scoped tables are otherwise unreachable from the console)
    window.__pv = Object.freeze({ fareFor, routeLen, nearestRoadPoint, placeNameAt, FARE_BASE, FARE_PER_KM, TaxiService, fmtSentence, Prison, INMATES, intFloorY, houseInteriorDef, mansionInteriorDef, homeTier, rollLoot, LOOT_KIND, LOOT_VALUABLES, CAR_MSRP, DEALERSHIPS, CAR_REP, MoneyFeed, Links, GPS, splinePts, ROAD_STYLE, ZONE_CENTRE, gpsRoute, SCRATCH_CARDS, scratchRTP, SLOT_DEFS, SLOT_SYMS, slotRTP, slotSpin, slotTop, winClass, CASINO, ROYALE, ROYALE_MAJORS, ROYALE_PAY, ROYALE_BASE_RTP, ROYALE_DROUGHT_K, royaleSpin, royaleRollMajor, royaleSeedPressure, royaleChances, royaleEvery, royaleLive, royaleEval, royaleBuild, royaleBaseScale, royaleClass, roulettePick, roulLabel, parseMoney, fmtShort, bjValue, rank5, bestOf, handCat, HAND_NAMES, roulettePayout, ROUL_RED, makeDeck, pokerEquity, POKER_AI, VEH_STAGES, VEH_T, HP_BASE, GANG_AGGRO, CARGO_LB, GOOD_CLB, cargoC, cargoCapC, cargoFit, fmtLb, VEST_MAX, npcGunDamage, Inv, lotsFor, fmtQty, holdings: (o, z) => holdings(o, z, game.uw.market), GOOD_UNIT, PROP_BY_ID, RoadNet, SUPERBLOCKS, localRoadAt, localSurfaceAt, VY, PARK_LABEL, MAP_CATS, isOnRoad, SURF, GAME_CONFIG, CAMPAIGN, RACES, ARCS, IY, groundY, curbAt, ZONES, SaveSystem, VEHICLES, INTERIOR_DEFS, ACHIEVEMENTS, SECRETS, GOODS, FACTIONS, PROPS, OFFICERS, RANKS, CREW_RANKS, LaunderFixer, WarehouseSystem, PED_TYPES, PED_JACKPOTS, pedType, pocketLoot, BIZ_CATS, BIZ_IDS, HOOD, bizUpgradeCost, housePlan, kitReach, turfAt, sidewalkSpot, units, WEAPONS, factionLook, copLook, randomLook, lookFrom, copPost, copBrain, copFootChase, copWalkBack });
    await game.init(progress);
  } catch (e) {
    console.error(e);
    $('loaderr').textContent = 'Failed to start: ' + (e && e.message ? e.message : e);
  }
})();
