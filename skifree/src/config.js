// Every gameplay tuning value lives here. Nothing else in the game hard-codes
// a feel number. Units: world units ("u") are CSS pixels at zoom 1, METER u
// make one metre, time is seconds, angles are radians. Heading 0 points
// straight downhill (+y); negative angles point to screen-left.

export const METER = 16;
const M = METER;
const DEG = Math.PI / 180;

export const CONFIG = {
  // ---------------------------------------------------------------- player
  PLAYER_SPEED: 15 * M,              // top cruising speed pointed straight down
  PLAYER_ACCELERATION: 5.2 * M,      // speed gained per second below target
  PLAYER_FRICTION: 6 * M,            // speed lost per second above target
  PLAYER_TURN_RATE: 3.4,             // rad/s of heading change at walking pace
  PLAYER_TURN_SPEED_REF: 13 * M,     // turning halves around this speed
  PLAYER_MIN_TURN_RATE: 1.25,        // turning never drops below this
  PLAYER_GRIP: 7.5,                  // rad/s the travel direction chases the skis
  PLAYER_GRIP_SPEED_REF: 16 * M,     // grip halves around this speed
  PLAYER_SKID_DECEL: 11 * M,         // speed scrubbed per second when fully sideways
  PLAYER_STOP_ANGLE: 78 * DEG,       // skis past this are "across the hill" and stop
  PLAYER_WALK_SPEED: 2.6 * M,        // sidestep speed when stopped across the hill
  PLAYER_TUCK_ACCEL: 2.2 * M,        // extra acceleration while holding up
  PLAYER_TUCK_TURN_RATE: 2.6,        // rad/s the skis swing downhill while holding up
  PLAYER_BRAKE_DECEL: 13 * M,        // speed lost per second while braking
  PLAYER_START_PUSH: 3 * M,          // initial shove so the run starts moving
  COLLISION_RADIUS: 6,               // the skier's footprint

  // ----------------------------------------------------------------- turbo
  TURBO_SPEED: 25 * M,
  TURBO_ACCELERATION: 11 * M,
  TURBO_TURN_MULT: 0.55,             // turning while on the F key
  TURBO_GRIP_MULT: 0.6,              // and it slides more

  // ------------------------------------------------------------------ jump
  GRAVITY_AIR: 1450,                 // u/s^2 pulling an airborne skier down
  HOP_VELOCITY: 330,                 // space-bar hop
  HOP_COOLDOWN: 0.15,
  RAMP_VELOCITY_MIN: 360,
  RAMP_VELOCITY_PER_SPEED: 1.35,     // extra launch per u/s of ground speed
  AIR_TURN_MULT: 0.45,
  LAND_SAFE_ANGLE: 62 * DEG,         // landing more sideways than this is a wipeout
  STYLE_PER_AIR_SECOND: 60,
  STYLE_RAMP_BONUS: 20,
  STYLE_GATE: 10,
  STYLE_ESCAPE: 500,

  // --------------------------------------------------------- air tricks
  // Up = backflip, Down = spread eagle, Space in the air = helicopter spin.
  // A trick scores only when you land it clean off a ramp; landing mid-trick
  // is a wipeout.
  TRICKS: {
    flip: { dur: 0.62, style: 40 },
    eagle: { dur: 0.34, style: 15 },
    spin: { dur: 0.5, style: 25 },
  },

  // -------------------------------------------------------------- courses
  COURSE_MISS_PENALTY: 5,            // seconds added per missed gate
  COURSE_LANE_HALF: 40 * M,          // stray further than this and the run is void

  // ------------------------------------------------------------ collisions
  CRASH_TIME_BASE: 0.55,             // seconds face-down after a hard hit
  CRASH_TIME_PER_SPEED: 0.0016,      // + this per u/s at impact
  CRASH_TIME_MAX: 1.3,
  TUMBLE_TIME: 0.45,                 // lighter trips (stumps, dogs, moguls)
  RECOVER_TIME: 0.32,                // getting back up
  GRACE_TIME: 0.8,                   // ghost through obstacles after standing up
  CRASH_KNOCKBACK: 90,               // u/s sideways shove off a hard obstacle
  CRASH_SPEED_KEEP: 0.08,
  TUMBLE_SPEED_KEEP: 0.45,
  MOGUL_BOUNCE: 150,
  MOGUL_SPEED_LOSS: 0.1,
  MOGUL_WIPEOUT_SPEED: 21 * M,       // above this a mogul can take you down
  MOGUL_WIPEOUT_CHANCE: 0.35,

  // ------------------------------------------------------------------ yeti
  YETI_TRIGGER_DISTANCE: 2000,       // metres downhill before the first yeti
  YETI_RETURN_DISTANCE: 700,         // metres after an escape before it returns
  // Like the original, dawdling or leaving the mountain also summons it.
  YETI_STALL_TIME: 30,               // seconds without real downhill progress...
  YETI_STALL_PROGRESS: 20,           // ...of at least this many metres
  YETI_STALL_WARN: 20,               // a distant roar this long into a stall
  YETI_WANDER_X: 900 * M,            // this far sideways from the lodge
  YETI_STALL_GRACE_METERS: 40,       // no stall clock at the trailhead
  YETI_SPEED: 17.2 * M,              // beats cruising, loses to turbo
  YETI_SPEED_STEP: 0.04,             // +4% every time it comes back
  YETI_SPEED_STEP_MAX: 0.16,
  YETI_ACCELERATION: 14 * M,
  YETI_TURN_RATE: 4.2,
  YETI_START_DISTANCE: 520,          // u behind the player when it appears
  YETI_CATCH_RADIUS: 20,
  YETI_REACH_HEIGHT: 34,             // a skier higher than this sails over its arms
  YETI_ESCAPE_DISTANCE: 1150,        // u of separation that counts as losing it...
  YETI_ESCAPE_TIME: 2.5,             // ...held this long
  YETI_LEAD_TIME: 0.7,               // max seconds it predicts ahead
  YETI_CATCHUP_BONUS: 0.1,           // mild pace boost while far behind (not vs turbo)
  YETI_CATCHUP_DISTANCE: 750,
  YETI_STUMBLE_TIME: 0.75,
  YETI_STUMBLE_SPEED_KEEP: 0.3,
  YETI_PROBE_TIME: 0.42,             // seconds of look-ahead for obstacle avoidance
  YETI_EAT_TIME: 3.1,                // whole grab/gulp/celebrate sequence
  YETI_EAT_SKIPPABLE_AFTER: 1.3,
  YETI_DRAW_SCALE: 1.3,              // it's big: drawn larger than its footprint
  CAMERA_EAT_ZOOM: 0.7,              // camera pushes in on the meal

  // ---------------------------------------------------------------- actors
  NPC_SKIER_SPEED_MIN: 6 * M,
  NPC_SKIER_SPEED_MAX: 10.5 * M,
  SNOWBOARDER_SPEED_MIN: 11 * M,
  SNOWBOARDER_SPEED_MAX: 14 * M,
  DOG_SPEED: 13 * M,
  DOG_TROT_SPEED: 4 * M,
  NPC_FALL_TIME: 1.6,
  ACTOR_ACTIVE_RADIUS: 1700,         // u from the camera where actors simulate
  ACTOR_DESPAWN_BEHIND: 900,         // u above the view top before removal

  // ----------------------------------------------------------------- world
  WORLD_SIZE: 1800 * M,              // skiable width; deep forest walls beyond it
  CHUNK_SIZE: 512,
  CELL_SIZE: 64,                     // at most one scattered object per cell
  // Jitter is confined to +/-(CELL/2 - MARGIN), so two neighbouring objects'
  // centres are at least 2*MARGIN = 42u apart. The biggest trunks are r=13,
  // leaving a 16u gap: always wide enough for the skier (12u), never for the
  // yeti (24u). That guarantee is checked by tests/sim.mjs.
  CELL_MARGIN: 21,
  REGION_CHUNKS: 6,                  // biome patches are this many chunks square
  OBJECT_DENSITY: 1,                 // global multiplier on every biome
  DENSITY_RAMP_METERS: 1600,         // density grows to full over this distance
  START_CLEAR_RADIUS: 34 * M,
  START_EASY: 260 * M,               // lighter biomes for the opening stretch
  ACTORS_PER_CHUNK: 0.28,
  DOGS_PER_CHUNK: 0.13,
  GENERATE_MARGIN: 700,              // u beyond the view edge kept generated
  EVICT_MARGIN: 1400,

  // ------------------------------------------------------------ start area
  COURSE_LENGTH: 640 * M,
  SLALOM_X: -58 * M,
  TREE_SLALOM_X: -118 * M,
  FREESTYLE_X: 62 * M,
  LIFT_X: 130 * M,
  LIFT_TOWER_SPACING: 60 * M,

  // ---------------------------------------------------------------- camera
  CAMERA_ANCHOR: 0.32,               // player screen-y fraction at rest
  CAMERA_ANCHOR_FAST: 0.22,          // ...and at turbo speed (more look-ahead)
  CAMERA_ZOOM_OUT_FAST: 0.1,         // widen the view by this fraction at speed
  CAMERA_SMOOTH: 6,
  CAMERA_SHAKE_TURBO: 1.2,           // px of wobble at full turbo
  // The camera shows at least this much mountain (world units)...
  VIEW_MIN_W: 560,
  VIEW_MIN_H: 640,
  // ...relaxed on small screens so the skier never shrinks to a speck.
  VIEW_SMALL_W: 380,
  VIEW_SMALL_H: 440,
  ZOOM_MIN: 0.6,
  ZOOM_MAX: 2.4,

  // --------------------------------------------------------------- effects
  SNOW_EFFECTS: true,
  MAX_PARTICLES: 520,
  TRACK_POINTS: 900,
  TRACK_SPACING: 5,

  // ----------------------------------------------------------------- audio
  AUDIO_VOLUME: 0.8,
  MUSIC_VOLUME: 0.45,
  SFX_VOLUME: 0.9,

  // ---------------------------------------------------------------- engine
  SIM_STEP: 1 / 120,
  MAX_FRAME_DT: 0.1,
};

// Converts a world-unit speed to the km/h shown in the HUD.
export const toKmh = (u) => (u / METER) * 3.6;
export const toMeters = (u) => u / METER;
