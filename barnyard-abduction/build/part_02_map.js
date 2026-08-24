
/* ============================================================================
   SECTION 02 — MAP REGISTRY
   ----------------------------------------------------------------------------
   D-024 / WORLD_BIBLE "Architecture rule for maps": core systems are map
   agnostic. A map supplies its own bounds, regions, landmarks, prop palette,
   spawn zones, NPC set, missions, lighting and collision registry. The UFO,
   beam, HUD, scoring, save, audio and mission systems below never name a map.

   Only Map 1 (Farm) is BUILT. The other nine are declared with `built:false`
   so the campaign screen can show them honestly as not-yet-implemented rather
   than faking them (FEATURE_REGISTRY "no-stub rule").
   ========================================================================== */
var MAPS = {
  farm: {
    id: 'farm', index: 1, name: 'The Farm', built: true,
    blurb: 'A 425×425 family farm. Barn, farmhouse, plowed field, pond and a very irritated man with a pitchfork.',
    size: 425,
    sky: { top: 0x59a9dd, bottom: 0xcfeaf6, fog: 0xc4e4f2, fogNear: 260, fogFar: 620 },
    light: { sun: 0xfff3d6, sunInt: 1.25, amb: 0xbfd9e8, ambInt: 0.72,
             sunPos: [120, 190, 90] },
    ground: 0x6cbf4a,
    /* Region tints painted into terrain vertex colours with soft falloff —
       this is how "no hard quadrant borders" (D-006) is achieved. */
    regions: [
      { id:'lawn',    c:0x84cf58, cx:-125, cz:-125, r:52,  soft:26 },
      { id:'barnyard',c:0xb59a66, cx:-150, cz:-92,  r:56,  soft:30 },
      { id:'plowed',  c:0x8a6440, cx: 118, cz:-108, r:78,  soft:34 },
      { id:'shore',   c:0x9c8a5e, cx: 115, cz: 135, r:44,  soft:22 },
      { id:'grove',   c:0x5aa83f, cx:-115, cz: 120, r:62,  soft:34 }
    ],
    landmarks: [
      { id:'farmhouse', kind:'farmhouse', x:-125, z:-125, w:26, d:20, h:14, collide:true,  rot:0 },
      { id:'barn',      kind:'barn',      x:-165, z:-95,  w:36, d:28, h:22, collide:true,  rot:0 },
      { id:'shed',      kind:'shed',      x:-145, z:-55,  w:14, d:10, h:8,  collide:false, rot:0.3 },
      { id:'windmill',  kind:'windmill',  x: 155, z: 145, w:8,  d:8,  h:32, collide:true,  rot:0 },
      { id:'truck',     kind:'truck',     x:-105, z:-145, w:7,  d:3,  h:3,  collide:false, rot:0.15 },
      { id:'tractorA',  kind:'tractor',   x:-125, z:-80,  w:8,  d:5,  h:5,  collide:false, rot:-0.6, plow:false },
      { id:'tractorB',  kind:'tractor',   x: 120, z:-105, w:12, d:6,  h:5,  collide:false, rot:1.9,  plow:true  }
    ],
    pond:  { x:115, z:135, w:58, d:42 },
    grove: { x:-115, z:120, r:34, trees:6 },
    plowedField: { x:118, z:-108, w:150, d:112, rot:0.1 },
    /* Curving dirt roads as quadratic beziers, painted into the terrain. */
    roads: [
      { p:[[-105,-212],[-108,-172],[-118,-140]], w:7 },   // gate -> farmhouse
      { p:[[-118,-136],[-142,-118],[-160,-104]], w:6 },   // farmhouse -> barn
      { p:[[-150,-88],[-70,-70],[ 60,-96]],      w:5.5 }, // barnyard -> field
      { p:[[-140,-52],[ -20, 40],[ 96, 120]],    w:4.5 }  // farm -> pond
    ],
    spawnZones: {
      pasture:   { x: -20, z: 10,  r: 105 },
      field:     { x: 100, z:-100, r: 58  },
      fieldEdge: { x:  60, z: -60, r: 62  },
      barnyard:  { x:-146, z: -92, r: 42  },
      pondside:  { x: 108, z: 132, r: 48  },
      grove:     { x:-115, z: 120, r: 46  },
      margin:    { x:   0, z: 130, r: 90  },
      anywhere:  { x:   0, z:   0, r: 190 }
    },
    farmerHome: [-125, -108],
    farmerPatrol: [[-125,-108],[-60,-70],[20,20],[-70,90],[-140,60],[-150,-60]],
    ufoStart: [0, 16, 60],
    missions: [
      { id:'f1', name:'First Contact',   goal:8,  time:180, blurb:'Ease in. Grab eight animals — anything counts.' },
      { id:'f2', name:'Prize Livestock', goal:12, time:170, blurb:'Twelve animals. The farmer is paying attention now.' },
      { id:'f3', name:'Herd Mentality',  goal:18, time:165, blurb:'Eighteen. Chain them fast — combos are the only way.' },
      { id:'f4', name:'Clean Sweep',     goal:26, time:200, blurb:'Twenty-six animals with two farmers on patrol.', farmers:2 },
      { id:'f5', name:'Harvest Moon',    goal:34, time:210, blurb:'The big one. Three farmers, and they are done being polite.', farmers:3 }
    ]
  }
};

/* The rest of the locked campaign order (D-022). Declared, not faked. */
[['smalltown','Small Town'],['campground','Campground'],['ruraltown','Rural Town'],
 ['city','City'],['military','Military Base'],['harbor','Coastal Harbor'],
 ['desert','Desert Research Facility'],['snowy','Snowy Mountain Area'],
 ['launch','Space Launch Complex']
].forEach(function (m, i) {
  MAPS[m[0]] = { id:m[0], index:i + 2, name:m[1], built:false,
    blurb:'Locked. Per the map-authenticity rule this environment must be researched and built with its own props, architecture and NPCs before it ships — no recycled farm assets.' };
});

var MAP_ORDER = ['farm','smalltown','campground','ruraltown','city',
                 'military','harbor','desert','snowy','launch'];
