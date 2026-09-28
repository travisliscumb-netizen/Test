// Static object catalogue. Collision is resolved against a circle at the
// object's base (the trunk, not the canopy), which is what the eye reads as
// "the bit you hit" in a top-down view.
//
//   r      footprint radius in world units (0 = never collides)
//   h      height; an airborne skier higher than this clears it
//   hit    what happens to a skier: crash | tumble | bounce | ramp | smash | knock | none
//   yeti   what happens to the yeti: stumble | smash | ignore
//   solid  actors steer around it
export const OBJECTS = {
  tree_s:     { r: 8,  h: 58,  hit: 'crash',  yeti: 'stumble', solid: true },
  tree_m:     { r: 10, h: 82,  hit: 'crash',  yeti: 'stumble', solid: true },
  tree_l:     { r: 13, h: 112, hit: 'crash',  yeti: 'stumble', solid: true },
  tree_snowy: { r: 11, h: 92,  hit: 'crash',  yeti: 'stumble', solid: true },
  tree_dead:  { r: 7,  h: 72,  hit: 'crash',  yeti: 'smash',   solid: true },
  rock_s:     { r: 8,  h: 12,  hit: 'tumble', yeti: 'ignore',  solid: true },
  rock_l:     { r: 14, h: 26,  hit: 'crash',  yeti: 'stumble', solid: true },
  stump:      { r: 7,  h: 10,  hit: 'tumble', yeti: 'ignore',  solid: true },
  mogul:      { r: 14, h: 6,   hit: 'bounce', yeti: 'ignore',  solid: false },
  snowman:    { r: 9,  h: 40,  hit: 'smash',  yeti: 'smash',   solid: true },
  ramp:       { r: 16, h: 0,   hit: 'ramp',   yeti: 'ignore',  solid: false },
  flag_red:   { r: 3,  h: 40,  hit: 'knock',  yeti: 'smash',   solid: false },
  flag_blue:  { r: 3,  h: 40,  hit: 'knock',  yeti: 'smash',   solid: false },
  sign:       { r: 6,  h: 44,  hit: 'tumble', yeti: 'smash',   solid: true },
  lift_tower: { r: 9,  h: 220, hit: 'crash',  yeti: 'stumble', solid: true },
  gate:       { r: 0,  h: 0,   hit: 'none',   yeti: 'ignore',  solid: false },
};

export const TREE_TYPES = ['tree_s', 'tree_m', 'tree_l', 'tree_snowy', 'tree_dead'];

// Sign faces. Index is stored in the object's `v` field.
export const SIGNS = ['SLALOM', 'TREE SLALOM', 'FREESTYLE', 'FINISH', 'YETI XING', 'SKIFREE'];
export const SIGN = Object.fromEntries(SIGNS.map((s, i) => [s, i]));

// Largest collision radius: queries pad by this so nothing is missed at chunk edges.
export const MAX_OBJECT_RADIUS = Math.max(...Object.values(OBJECTS).map((o) => o.r));
