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
    window.__pv = Object.freeze({ PICK_WARY, pickWary, ZONE_WEALTH, JAIL_OPS, GOOD_IDS, BIZ_UPKEEP, TUTORIAL, CAMPAIGN, TAXI_RULES, PHONE_APPS, Tools, TOOLS, ROB_THEMES, ROB_CAT_THEME, ROB_SEC, BURGLARY, STORE_ROB, bizInteriorDef, robTheme, pocketTimeK, eventBias, Legal, LEGAL, Fronts, FRONT, JAIL, JAIL_SPEEDS, INMATE_FAVORS, baccaratDeal, baccaratPay, crapsRoll, crapsDecision, crapsPay, tcpRank, tcpCmp, tcpDeal, tcpRound, sportsDay, SPORTS, UNIQUE_CARS, UNIQUE_BY, UniqueCars, isUniqueType, zoneKey, raceCheckpoints, routeRacePath, RoadGraph, CurbCuts, kerbSpot, kerbBlocked, CURVED_STREETS, RG_STREETS, fareFor, routeLen, nearestRoadPoint, placeNameAt, FARE_BASE, FARE_PER_KM, TaxiService, fmtSentence, Prison, INMATES, intFloorY, houseInteriorDef, mansionInteriorDef, homeTier, rollLoot, LOOT_KIND, LOOT_VALUABLES, CAR_MSRP, DEALERSHIPS, CAR_REP, MoneyFeed, Links, GPS, splinePts, ROAD_STYLE, ZONE_CENTRE, gpsRoute, SCRATCH_CARDS, scratchRTP, SLOT_DEFS, SLOT_SYMS, slotRTP, slotSpin, slotTop, winClass, CASINO, ROYALE, ROYALE_MAJORS, ROYALE_PAY, ROYALE_BASE_RTP, ROYALE_DROUGHT_K, royaleSpin, royaleRollMajor, royaleSeedPressure, royaleChances, royaleEvery, royaleLive, royaleEval, royaleBuild, royaleBaseScale, royaleClass, roulettePick, roulLabel, parseMoney, fmtShort, bjValue, rank5, bestOf, handCat, HAND_NAMES, roulettePayout, ROUL_RED, makeDeck, pokerEquity, POKER_AI, VEH_STAGES, VEH_T, HP_BASE, GANG_AGGRO, CARGO_LB, GOOD_CLB, cargoC, cargoCapC, cargoFit, fmtLb, VEST_MAX, npcGunDamage, Inv, lotsFor, fmtQty, holdings: (o, z) => holdings(o, z, game.uw.market), GOOD_UNIT, PROP_BY_ID, RoadNet, SUPERBLOCKS, localRoadAt, localSurfaceAt, VY, PARK_LABEL, MAP_CATS, isOnRoad, SURF, GAME_CONFIG, CAMPAIGN, RACES, ARCS, IY, groundY, curbAt, ZONES, SaveSystem, VEHICLES, INTERIOR_DEFS, ACHIEVEMENTS, SECRETS, GOODS, FACTIONS, PROPS, OFFICERS, RANKS, CREW_RANKS, LaunderFixer, WarehouseSystem, CompoundSystem, ThreatSystem, RivalWarehouses, RIVAL_WH, VehicleRegistry, VREG, HotWatch, ImpoundLot, ChopShop, HOT_T, IMPOUND, OVERFLOW_BAY, OVERFLOW_ROWS, CHOP_WORK, RaceRules, PinkSlips, CarWash, RACE_T, WASH_T, carWorth, DriveAI, MotorsportPark, VP_EVENTS, OffroadPark, OR_EVENTS, OR_PARK, cfsSafeSpeeds, pathCheckpoints, cfsRacePath, loopCheckpoints, venueOf, VP_PARK, VP, VP_TRACK, VP_PIT, VP_SITE, vpTrackLine, vpCheckpoints, vpSafeSpeeds, inValenPoint, offCity, vpSide, Terrain, TSURF, TSURF_FX, TRAIL, trailOf, CFS, CF_STRIP, CFS_COURSE, CFS_SITE, cfsCourseLine, inCedarSouth, cfsSide, extSide, inExtension, extRoadSpots, filletLoop, ShipmentSystem, SHIP_T, IMPORT, RAID_T, rivalInteriorDef, PRESSURE, PRESS_STAGE, THREAT_T, LaneDriver, InteriorKit, warehouseInteriorDef, WH_FENCE, WH_GATE, WH_SURV, PED_TYPES, PED_JACKPOTS, pedType, pocketLoot, BIZ_CATS, BIZ_IDS, HOOD, bizUpgradeCost, housePlan, kitReach, turfAt, sidewalkSpot, units, WEAPONS, factionLook, copLook, randomLook, lookFrom, copPost, copBrain, copFootChase, copWalkBack });
    await game.init(progress);
  } catch (e) {
    console.error(e);
    $('loaderr').textContent = 'Failed to start: ' + (e && e.message ? e.message : e);
  }
})();
