/* =====================================================================
   [CORE+CONTENT] GAME_CONFIG — one index of every tunable and data table.
   The tables themselves stay next to the code that uses them; this frozen
   registry is the single place to find (and, in a new game, replace) them.
   ===================================================================== */
const GAME_CONFIG = Object.freeze({
  version: MASTER_TEMPLATE_VERSION,
  save: { key: SAVE_KEY, version: SAVE_VERSION },
  world: { blockPitch: P, blocks: N, citySize: CITY, roadHalf: ROAD_HALF, walkWidth: WALK_W, lane: LANE, curb: CURB_H, gravity: GRAVITY,
    landUse: DISTRICT_MAP, zones: ZONES, zoneMap: ZONE_MAP, specialBlocks: SPECIAL, landmarks: LANDMARK_BLOCKS, pedDensity: BLOCK_DENSITY },
  input: { keymap: KEYMAP },
  graphics: { quality: QUALITY, weather: WEATHER },
  police: { heatLevels: HEAT_LEVELS, crimes: CRIMES, unitsPerLevel: UNITS_PER_LEVEL },
  vehicles: { specs: VEHICLES, civilianMix: CIVIL_TYPES },
  props: PROP_DEFS,
  economy: { upgrades: UPGRADES, dealer: DEALER, money: MONEY_SOURCES, stuntDailyCap: STUNT_DAILY_CAP, medicalDebtCap: MEDICAL_DEBT_CAP, tuning: TUNE, tuningRep: TUNE_REP, store: STORE_ITEMS, reputation: REP_LEVELS },
  underworld: { goods: GOODS, tiers: TIERS, demand: DEMAND, nightDemand: NIGHT_DEMAND, turfNames: TURF_NAMES, factions: FACTIONS, startOwner: START_OWNER, stages: STAGES,
    properties: PROPS, spots: SPOTS, hqs: HQS, chopValue: CHOP_VALUE, trunkCap: CARGO_LB, cargoLb: CARGO_LB, goodClb: GOOD_CLB, crewRoles: CREW_ROLES, ranks: RANKS, promoCost: PROMO_COST, traits: TRAITS,
    officers: OFFICERS, jailSecPerDay: JAIL_SEC_PER_DAY, jailStreetRatio: JAIL_STREET_RATIO, jailSpeeds: JAIL_SPEEDS, sentenceFactor: SENTENCE_FACTOR, chorePts: CHORE_PTS, sentenceBase: SENTENCE_BASE, sentenceMax: SENTENCE_MAX, inmates: INMATES, crimeDays: CRIME_DAYS, crimePressure: CRIME_PRESSURE },
  content: { contacts: CONTACTS, sideJobNames: MISSION_NAMES, arcs: ARCS, campaign: CAMPAIGN, races: RACES, events: EVENT_TYPES,
    interiors: INTERIOR_DEFS, outfits: OUTFITS, achievements: ACHIEVEMENTS, secrets: SECRETS, policePosts: POSTS }
});

