/* =====================================================================
   [UNDERWORLD] HOMES, PARKING & GARAGES
   The property ladder: twenty-odd homes from a bedsit with one kerbside space to the
   Crestmoor estate with a ten-car underground garage. Every property with parking owns a
   list of bays (kerb, driveway, carport, garage, underground). Stored cars are real cars
   parked in those bays whenever you are nearby: get in and drive off to take one out, drive
   into a free bay and park to store one. A car you leave somewhere is towed back to its bay
   once you are far away. Enclosed garages have doors that open for their owner.
   ===================================================================== */
const VY = -30; // drive-in garages below the street (on-foot interiors use IY)
const PARK_LABEL = { street: 'kerb space', lot: 'lot space', carport: 'carport', single: 'garage', double: 'garage', triple: 'garage', under: 'underground garage', yard: 'yard', outdoor: 'reserved space' };
const HOME_STREETS = { l: ['Maple Court', 'Birchwood Crescent', 'Alder Close', 'Juniper Court', 'Hawthorn Way', 'Rowan Crescent', 'Larkspur Close', 'Linden Row'], u: ['Crestmoor Drive', 'Bayview Terrace', 'Summit Lane', 'Gatehouse Road', 'The Ridgeway', 'Highcliff Avenue'], r: ['Mill Road'] };
// the ladder. home: a filter over world.homes (first match by spread order), at: kerbside door
const HOME_LADDER = [
  { id: 'bedsit', name: 'Ninth Street Bedsit', tier: 1, type: 'Rented room', price: 3200, at: [2, 7, 2, 30], street: 1, storage: 25, desc: 'One room above a corner shop in the Old Quarter. Street parking, thin walls.' },
  { id: 'rowhouse', name: 'Tanner’s Row Terrace', tier: 1, type: 'Old terrace house', price: 5200, at: [0, 5, 1, 44], street: 1, storage: 45, desc: 'A narrow brick terrace on a rough street. One kerbside space if you are quick.' },
  { id: 'semi', name: null, tier: 1, type: 'Semi-detached', price: 7400, home: h => h.type === 'semi', fb: h => h.district === 'l' && h.garage === 'street', storage: 50, desc: 'Half a house on a quiet Linden Hills street. You share a wall and a hedge.' },
  { id: 'apt', name: null, tier: 2, type: 'Walk-up apartment', price: 9800, home: h => h.type === 'apartment', fb: h => h.district === 'l' && h.garage === 'carport', storage: 60, desc: 'A third-floor apartment with a numbered space on the residents’ lot.' },
  { id: 'bungalow', name: null, tier: 2, type: 'Bungalow', price: 12500, home: h => h.type === 'bungalow' && h.garage === 'carport', fb: h => h.garage === 'carport', storage: 60, desc: 'Single storey, a carport and a lawn someone else used to mow.' },
  { id: 'starter', name: null, tier: 2, type: 'Small detached', price: 14800, home: h => h.type === 'house' && h.garage === 'carport', fb: h => h.district === 'l' && h.garage === 'carport', storage: 70, desc: 'A small detached house with a carport for two at a squeeze.' },
  { id: 'cottage', name: 'Mill Cottage', tier: 2, type: 'Country cottage', price: 11800, home: h => h.name === 'Mill Cottage', storage: 80, desc: 'Out past the fields where the streetlights stop. Nobody hears anything.' },
  { id: 'single1', name: null, tier: 3, type: 'Detached house', price: 19500, home: h => h.district === 'l' && h.garage === 'single', storage: 80, crew: 1, desc: 'A proper house with a single garage and a door that locks.' },
  { id: 'single2', name: null, tier: 3, type: 'Detached house', price: 23500, home: h => h.district === 'l' && h.garage === 'single', storage: 80, crew: 1, desc: 'Corner of the court, a single garage and a big back garden.' },
  { id: 'farm', name: 'Cedar Farmhouse', tier: 4, sig: 'r', type: 'Farmhouse', price: 52000, home: h => h.name === 'Cedar Farmhouse', yard: 1, storage: 200, crew: 2, desc: 'The Cedar Fields signature house: fields, a barn, a spot in the yard and ten rooms. The quietest address you can buy.' },
  { id: 'double1', name: null, tier: 4, type: 'Family home', price: 34000, home: h => h.district === 'l' && h.garage === 'double', storage: 100, crew: 1, desc: 'A double garage, a long drive and neighbours who mind their own business.' },
  { id: 'double2', name: null, tier: 4, type: 'Upscale house', price: 52000, home: h => h.district === 'u' && h.garage === 'double', fb: h => h.garage === 'double', storage: 110, crew: 2, infl: 5, desc: 'Crestmoor Heights: gated drive, double garage, a pool.' },
  { id: 'double3', name: null, tier: 4, type: 'Upscale house', price: 61000, home: h => h.district === 'u' && h.garage === 'double', fb: h => h.garage === 'double', storage: 120, crew: 2, infl: 5, desc: 'Hedges, a gate and a double garage on the quietest drive in Crestmoor.' },
  { id: 'triple1', name: null, tier: 5, type: 'Luxury home', price: 88000, home: h => h.garage === 'triple', storage: 140, crew: 2, infl: 10, luxury: true, desc: 'A triple garage, a curved drive and a view of the sea.' },
  { id: 'triple2', name: null, tier: 5, type: 'Luxury home', price: 104000, home: h => h.garage === 'triple', storage: 150, crew: 2, infl: 10, luxury: true, desc: 'Three garage doors, a pool terrace and a gate that knows your car.' },
  { id: 'triple3', name: null, tier: 5, type: 'Luxury home', price: 126000, home: h => h.garage === 'triple', fb: h => h.district === 'u', storage: 160, crew: 2, infl: 12, luxury: true, desc: 'The biggest house on Crestmoor Drive that isn’t a mansion.' },
  // ---- v6: 24 more homes (45 in all), spread over every residential market
  { id: 'pier_room', name: 'Pier Street Room', tier: 1, type: 'Rented room', price: 2900, at: [11, 6, 0, 56], street: 1, storage: 20, desc: 'A room over a chandler’s on the docks. Gulls, diesel and nobody asking.' },
  { id: 'neon_studio', name: 'Neon Row Studio', tier: 1, type: 'Studio flat', price: 4300, at: [5, 11, 3, 16], street: 1, storage: 30, desc: 'A studio above a karaoke bar on the Strip. Sleep is optional.' },
  { id: 'semi2', name: null, tier: 1, type: 'Semi-detached', price: 6900, home: h => h.type === 'semi', storage: 45, desc: 'Half a house with a lean-to and a hedge that needs cutting.' },
  { id: 'row2', name: null, tier: 1, type: 'Row house', price: 8100, home: h => h.type === 'semi', storage: 50, desc: 'An end-of-terrace with a little more garden than the rest.' },
  { id: 'market_apt', name: 'Market Street Apartment', tier: 2, type: 'Apartment', price: 10500, at: [3, 8, 1, 48], street: 1, storage: 50, desc: 'Two rooms over the Old Quarter market. Loud mornings, quiet nights.' },
  { id: 'apt2', name: null, tier: 2, type: 'Walk-up apartment', price: 9200, home: h => h.type === 'apartment', storage: 55, desc: 'A second-floor flat on the residents’ lot. The neighbours mind their own business.' },
  { id: 'bung2', name: null, tier: 2, type: 'Bungalow', price: 11000, home: h => h.type === 'bungalow' && h.garage === 'street', storage: 55, desc: 'A tidy bungalow with kerbside parking and a back gate.' },
  { id: 'bung3', name: null, tier: 2, type: 'Bungalow', price: 13200, home: h => h.type === 'bungalow' && h.garage === 'carport', storage: 60, desc: 'Single storey, a carport and a shed out back.' },
  { id: 'cul2', name: null, tier: 2, type: 'Small detached', price: 15600, home: h => h.district === 'l' && h.type === 'house' && h.garage === 'carport', storage: 70, desc: 'A starter house at the end of a cul-de-sac. One way in, one way out.' },
  { id: 'canal_loft', name: 'Canal Street Loft', tier: 4, sig: 'o', type: 'Warehouse loft', price: 64000, at: [5, 0, 0, 56], street: 2, storage: 160, crew: 2, infl: 8, desc: 'The Old Quarter signature home: a converted bonded warehouse, ten rooms behind a steel door.' },
  { id: 'single3', name: null, tier: 3, type: 'Detached house', price: 21500, home: h => h.district === 'l' && h.type === 'house' && h.garage === 'single', storage: 80, crew: 1, desc: 'Brick, a single garage and a long back garden.' },
  { id: 'single4', name: null, tier: 3, type: 'Detached bungalow', price: 18500, home: h => h.district === 'l' && h.type === 'bungalow' && h.garage === 'single', storage: 75, crew: 1, desc: 'A wide bungalow with a garage and a hedge for privacy.' },
  { id: 'family1', name: null, tier: 3, type: 'Family house', price: 24500, home: h => h.district === 'l' && h.type === 'house' && h.garage === 'single', storage: 90, crew: 1, desc: 'Four bedrooms upstairs, a garage, and a street full of kids on bikes.' },
  { id: 'family2', name: null, tier: 3, type: 'Family bungalow', price: 20500, home: h => h.district === 'l' && h.type === 'bungalow' && h.garage === 'single', storage: 85, crew: 1, desc: 'Room for everyone on one floor and a garage for the car.' },
  { id: 'single5', name: null, tier: 3, type: 'Detached house', price: 26500, home: h => h.district === 'l' && h.type === 'house' && h.garage === 'single', storage: 90, crew: 1, desc: 'A corner plot, a garage and a view down the hill.' },
  { id: 'double4', name: null, tier: 4, type: 'Family home', price: 39000, home: h => h.district === 'l' && h.garage === 'double', storage: 105, crew: 1, desc: 'A double garage and a drive long enough for a party.' },
  { id: 'double5', name: null, tier: 4, type: 'Upscale house', price: 58000, home: h => h.district === 'u' && h.garage === 'double', storage: 115, crew: 2, infl: 5, desc: 'Crestmoor: a gated drive, a double garage and a pool cover nobody lifts.' },
  { id: 'double6', name: null, tier: 4, type: 'Upscale house', price: 66000, home: h => h.district === 'u' && h.garage === 'double', storage: 120, crew: 2, infl: 6, desc: 'Big windows facing the sea and a double garage facing the street.' },
  { id: 'double7', name: null, tier: 4, type: 'Upscale house', price: 48000, home: h => h.district === 'u' && h.type === 'house' && h.garage === 'double', fb: h => h.garage === 'double', storage: 110, crew: 2, infl: 4, desc: 'The smallest house in Crestmoor, which still has a double garage.' },
  { id: 'harbour_condo', name: 'Harbourview Condo', tier: 4, type: 'Condominium', price: 46000, at: [8, 4, 1, 16], street: 2, storage: 100, crew: 1, infl: 6, desc: 'A Financial District condo with a doorman and two reserved spaces.' },
  { id: 'triple4', name: null, tier: 5, type: 'Luxury home', price: 118000, home: h => h.garage === 'triple', storage: 155, crew: 2, infl: 11, luxury: true, desc: 'Three garages, a tennis court and a gate with a camera on it.' },
  { id: 'sig_linden', name: 'Linden Manor', tier: 5, sig: 'l', type: 'Manor house', price: 82000, home: h => h.district === 'l' && h.garage === 'double', storage: 150, crew: 3, infl: 10, desc: 'The Linden Hills signature home: the biggest house on the hill, ten rooms and a double garage.' },
  { id: 'skyline', name: 'Skyline Residence', tier: 5, sig: 'c', type: 'Sky residence', price: 134000, at: [5, 7, 1, 32], street: 2, storage: 150, crew: 2, infl: 20, luxury: true, desc: 'The Financial District signature home: a full floor in a glass tower, eleven rooms and a private lift.' },
  { id: 'sig_crest', name: 'Highcliff House', tier: 5, sig: 'u', type: 'Signature villa', price: 142000, home: h => h.garage === 'triple', fb: h => h.district === 'u', storage: 180, crew: 3, infl: 25, luxury: true, desc: 'The Crestmoor signature home: a cliff-top villa with a games room, a bar and three garages.' },
  { id: 'mansion', name: 'Crestmoor Estate', tier: 6, type: 'Mansion', price: 380000, home: h => h.id === 'mansion', under: 10, storage: 400, crew: 4, infl: 60, luxury: true, desc: 'The estate on the point: grounds, a portico, a pool, and a ten-car motor court under the lawn.' }
];
// existing safehouses join the ladder too
const LADDER_EXTRA = { flop: { tier: 1, type: 'Rented room', street: 1 }, linden: { tier: 3, type: 'Detached house' }, loft: { tier: 3, type: 'Loft apartment', street: 2 }, penthouse: { tier: 6, type: 'Penthouse', under: 4, outdoor: 1 } };
// where each ladder home has always been (its front door). Layout changes elsewhere in the city
// (a new lane, a different house in some block) must never move a home someone already owns, so
// the ladder takes the pinned house when it still exists and only falls back to the filter.
const LADDER_PIN = { semi: [105.2, 734.3], apt: [127.4, 854], bungalow: [27.4, 852], starter: [42, 739.9], cottage: [60, 938.9], single1: [121.8, 734.9], single2: [20.2, 740.1], farm: [150, 903.1], double1: [43.8, 779.9], double2: [21.9, 192.1], double3: [112.1, 101.9], triple1: [208.2, 139.1], triple2: [191.8, 100.9], triple3: [59.1, 208.2], mansion: [80, 50.2], semi2: [94.8, 734.3], row2: [134.8, 734.7], apt2: [127.4, 826], bung2: [91.9, 700], bung3: [28, 772.6], cul2: [28, 747.6], single3: [59.9, 859.8], single4: [178.2, 812.1], family1: [228.1, 816.2], family2: [19.9, 859.8], single5: [11.9, 698.2], double4: [142, 785.1], double5: [112.1, 181.9], double6: [57.1, 127.5], double7: [21.9, 272.1], triple4: [128.2, 139.1], sig_linden: [20.2, 779.9], sig_crest: [128.2, 219.1] };
function defineHomeProps(world) {
  const H = world.homes, used = new Set();
  const take = (f, id) => {
    const pin = LADDER_PIN[id], ok = h => (!h.reserved || h.reserved === id) && !used.has(h.id);
    const pinned = pin && H.find(h => ok(h) && Math.hypot(h.door.x - pin[0], h.door.z - pin[1]) < 1.5);
    if (pinned) { used.add(pinned.id); return pinned; }
    const c = H.filter(h => ok(h) && f(h) && !Object.values(LADDER_PIN).some(q => Math.hypot(h.door.x - q[0], h.door.z - q[1]) < 1.5)); if (!c.length) return null;
    const h = c[Math.floor(c.length * 0.5)]; used.add(h.id); return h;
  };
  const streetN = {};
  const nameFor = h => { const list = HOME_STREETS[h.district] || HOME_STREETS.l, k = streetN[h.district] = (streetN[h.district] || 0) + 1; return `${(k * 7 + h.block % 9) * 2 + 1} ${list[(h.block + k) % list.length]}`; };
  for (const L of HOME_LADDER) {
    if (PROP_BY_ID[L.id]) continue;
    const def = { id: L.id, name: L.name, kind: 'safehouse', tier: L.tier, type: L.type, price: L.price, storage: L.storage, crew: L.crew || 0, infl: L.infl || 0, luxury: !!L.luxury, desc: L.desc, garage: 0, sig: L.sig || null };
    if (L.home) {
      const h = take(L.home, L.id) || (L.fb && take(L.fb, L.id));
      if (!h) continue; // a layout without a match simply has one home fewer
      h.reserved = L.id; def.home = h.id; def.name = L.name || nameFor(h);
      h.propId = L.id; h.ladderTier = L.tier; h.sig = !!L.sig;
    } else def.at = L.at;
    if (L.under) def.under = L.under;
    if (L.street) def.street = L.street;
    if (L.yard) def.yard = L.yard;
    PROPS.push(def); PROP_BY_ID[def.id] = def;
  }
  for (const id in LADDER_EXTRA) { const d = PROP_BY_ID[id]; if (d) Object.assign(d, LADDER_EXTRA[id]); }
  // v6: homes on a street door (rooms, flats, lofts, condos) get a flat behind the door, so every home can be
  // walked into (and, while it is someone else's, broken into)
  world.flats = [];
  for (const def of PROPS) {
    if (def.kind !== 'safehouse' || def.home || !def.at || def.place) continue;
    const d = sidewalkSpot(def.at[0], def.at[1], def.at[2], def.at[3], ROAD_HALF + 3.1), zk = zoneKey(d.x, d.z);
    const f = { id: 'flat:' + def.id, flat: true, type: 'apartment', floors: 1, district: zk, garage: 'street', x0: d.x - 6, z0: d.z - 6, x1: d.x + 6, z1: d.z + 6, face: 0, door: { x: d.x, z: d.z, h: d.h }, bays: [], propId: def.id, name: def.name, ladderTier: def.tier, sig: !!def.sig };
    world.flats.push(f); def.home = f.id;
  }
  // v6 attributes every home shows: security, finish and the neighbourhood it is in
  for (const def of PROPS) if (def.kind === 'safehouse' && def.tier) {
    def.sec = Math.min(5, HOME_SEC[def.tier] + (def.sig ? 1 : 0));
    def.finish = def.sig ? 'Signature' : HOME_FINISH[def.tier] || '';
  }
  // the starter safehouse is a real house too
  const lh = H.find(h => h.reserved === 'linden'); if (lh && PROP_BY_ID.linden) { PROP_BY_ID.linden.home = lh.id; lh.propId = 'linden'; }
  // ladder order for menus and the map index
  world.homeProps = PROPS.filter(p => p.tier).sort((a, b) => a.tier - b.tier || a.price - b.price).map(p => p.id);
}
// turn a purchasable home's solid garage block into a real garage: walls, roof and a door
function hollowGarage(world, h, propId) {
  const r = h.garageRect; if (!r || !r.building) return;
  const bld = r.building, b = world.blocks[h.block];
  bld.hollow = true; if (bld.col) bld.col.on = false;
  const f = FACE_V[h.face], ns = h.face < 2, t = 0.25, col = bld.color.clone();
  const add = (x, z, sx, sz, y0 = 0, hh = r.h) => { const d = { kind: 'box', x, y: CURB_H + y0 + hh / 2, z, sx, sy: hh, sz, color: col, ry: 0 }; d.col = { x0: x - sx / 2, x1: x + sx / 2, z0: z - sz / 2, z1: z + sz / 2, y0: 0, y1: CURB_H + y0 + hh, kind: 'det' }; b.det.push(d); world.grid.add(d.col); };
  // back wall, two side walls, roof slab; the front is the door
  const cx = (r.x0 + r.x1) / 2, cz = (r.z0 + r.z1) / 2;
  if (ns) { const bz = f[1] < 0 ? r.z1 - t / 2 : r.z0 + t / 2; add(cx, bz, r.x1 - r.x0, t); add(r.x0 + t / 2, cz, t, r.z1 - r.z0); add(r.x1 - t / 2, cz, t, r.z1 - r.z0); }
  else { const bx = f[0] < 0 ? r.x1 - t / 2 : r.x0 + t / 2; add(bx, cz, t, r.z1 - r.z0); add(cx, r.z0 + t / 2, r.x1 - r.x0, t); add(cx, r.z1 - t / 2, r.x1 - r.x0, t); }
  b.det.push({ kind: 'box', x: cx, y: CURB_H + r.h + 0.1, z: cz, sx: r.x1 - r.x0 + 0.2, sy: 0.24, sz: r.z1 - r.z0 + 0.2, color: C(0x4a4f54), ry: 0 });
  b.det.push({ kind: 'box', x: cx, y: CURB_H + 0.02, z: cz, sx: r.x1 - r.x0 - 0.4, sy: 0.03, sz: r.z1 - r.z0 - 0.4, color: C(0x8a8780), ry: 0 });
  // the printed door panels are replaced by one working door
  const fr = h.garageFront;
  b.det = b.det.filter(d => !(h.garageDoors || []).some(gd => Math.abs(d.x - (gd.x + f[0] * 0.05)) < 0.01 && Math.abs(d.z - (gd.z + f[1] * 0.05)) < 0.01));
  world.doors = world.doors || [];
  world.doors.push({ id: 'gd:' + propId, x: fr.x + f[0] * 0.12, z: fr.z + f[1] * 0.12, w: fr.w - 0.6, h: r.h - 0.5, axis: ns ? 'x' : 'z', face: h.face, y: CURB_H, color: 0xe4e2dc, block: b.i, kind: 'owner', prop: propId });
}
Object.assign(PropertyManager.prototype, {
  // every parking bay of a property, in world space: { x, z, h, y, kind, i, space? }
  bays(def) {
    if (def._bays) return def._bays;
    const g = this.uw.g, w = g.world, out = [];
    const home = def.home ? w.homes.find(h => h.id === def.home) : null;
    if (home) for (const b of home.bays) out.push({ ...b });
    if (home && def.yard) { const f = FACE_V[home.face]; for (let k = 0; k < def.yard; k++) out.push({ x: home.door.x + f[0] * 9 + (home.face < 2 ? (k * 3.4 + 8) : 0), z: home.door.z + f[1] * 9 + (home.face < 2 ? 0 : (k * 3.4 + 8)), h: Math.atan2(-f[0], -f[1]), kind: 'yard', y: CURB_H }); }
    if (def.id === 'penthouse' && w.towerDrive) out.push({ ...w.towerDrive, kind: 'outdoor' });
    if (def.under && g.vspaces) { const vs = g.vspaces.byProp(def.id); if (vs) for (const b of vs.bays) out.push({ ...b, kind: 'under', space: vs.id }); }
    // kerbside spaces for flats, lock-ups and businesses without a drive
    const want = home ? 0 : (def.street || def.garage || 0);
    if (want && !out.length) {
      const L = this.uw.loc('prop', def.id);
      for (let k = 0; k < want; k++) { const c = curbNear(L.x + Math.sin(L.h) * 4, L.z + Math.cos(L.h) * 4, 7 + k * 6.2); out.push({ x: c.x, z: c.z, h: c.h, kind: def.kind === 'garage' || def.kind === 'warehouse' ? 'single' : 'street', y: 0 }); }
    }
    out.forEach((b, i) => { b.i = i; });
    def._bays = out;
    return out;
  },
  capOf(def) { return this.bays(def).length; },
  parkingText(def) {
    const bs = this.bays(def); if (!bs.length) return 'none';
    const n = {}; for (const b of bs) n[b.kind] = (n[b.kind] || 0) + 1;
    return Object.keys(n).map(k => `${n[k]} ${PARK_LABEL[k] || k}${n[k] > 1 && !/garage|yard/.test(PARK_LABEL[k]) ? 's' : ''}`).join(' + ');
  },
  garageCap() { let n = 0; for (const def of this.ownedList()) n += this.capOf(def); return n; },
  // the car stored in a bay (save entry), if any
  carAt(id, i) { return this.uw.g.save.garage.find(e => e.at && e.at.p === id && e.at.i === i) || null; },
  freeBay(def) { for (const b of this.bays(def)) if (!this.carAt(def.id, b.i)) return b; return null; },
  // one garage point per owned property with parking (prompt spot + the old API)
  garagePoints() {
    const out = [];
    for (const def of this.ownedList()) {
      const bs = this.bays(def); if (!bs.length) continue;
      const b0 = bs.find(b => b.kind !== 'under') || bs[0];
      out.push({ id: def.id, p: { x: b0.x, z: b0.z, h: b0.h, y: b0.y }, name: def.name + ' parking', bays: bs, def });
    }
    return out;
  },
  // every save entry sits in a bay of a property you own; anything left over waits in storage
  assignBays() {
    const s = this.uw.g.save, taken = new Set();
    for (const e of s.garage) {
      const def = e.at && PROP_BY_ID[e.at.p];
      const ok = def && this.owned(def.id) && this.bays(def)[e.at.i] && !taken.has(def.id + ':' + e.at.i);
      if (ok) taken.add(def.id + ':' + e.at.i); else e.at = null;
    }
    for (const e of s.garage) {
      if (e.at) continue;
      for (const def of this.ownedList()) { const b = this.bays(def).find(x => !taken.has(def.id + ':' + x.i)); if (b) { e.at = { p: def.id, i: b.i }; taken.add(def.id + ':' + b.i); break; } }
    }
  },
  nearFreeBay(x, z, y, r = 3.6) {
    let best = null, bd = r;
    for (const def of this.ownedList()) for (const b of this.bays(def)) {
      if (this.carAt(def.id, b.i)) continue;
      if (Math.abs((b.y === undefined ? groundY(b.x, b.z) : b.y) - y) > 2.5) continue;
      const d = Math.hypot(x - b.x, z - b.z); if (d < bd) { bd = d; best = { def, bay: b }; }
    }
    return best;
  },
  garageActionVehicle(v) {
    const g = this.uw.g;
    const fb = this.nearFreeBay(v.pos.x, v.pos.z, v.pos.y);
    if (fb) return { label: `Park & save · ${fb.def.name} (${PARK_LABEL[fb.bay.kind] || 'space'} ${fb.bay.i + 1} of ${this.capOf(fb.def)})`, act: () => g.content.storeVehicle(v, { id: fb.def.id, def: fb.def, bay: fb.bay, p: fb.bay, name: fb.def.name }) };
    return null;
  }
});

/* Dealership lots (v6): stock lives in the save (save.dealers), changes on the street calendar, and stands on
   the lot as real cars when you are near: locked, inspectable, bought where they stand. */
class DealerLots {
  constructor(g) { this.g = g; this.cars = new Map(); this.t = 0; }
  get day() { return this.g.uw ? this.g.uw.S.day : 1; }
  place(lot) { const D = DEALERSHIPS[lot]; return D && this.g.world.places[D.place]; }
  state(lot) {
    const s = this.g.save, all = s.dealers || (s.dealers = {});
    let st = all[lot];
    const n = (this.place(lot) || { slots: [] }).slots.length;
    if (!st || !Array.isArray(st.cars) || st.cars.length !== n) st = all[lot] = { d: -999, cars: new Array(n).fill(null), n: 0 };
    return st;
  }
  rng(lot, salt) { const st = this.state(lot); st.n = (st.n + 1) % 1e9; return mulberry32((this.day * 7919 + salt * 104729 + st.n * 31 + lot.length * 977) >>> 0); }
  // one car for a stall
  make(lot, i, have) {
    const D = DEALERSHIPS[lot], R = this.rng(lot, i), pickW = list => { let t = 0; for (const [, w] of list) t += w; let r = R() * t; for (const [k, w] of list) { r -= w; if (r <= 0) return k; } return list[0][0]; };
    let type;
    if (lot === 'new') type = D.line[i % D.line.length];
    else if (lot === 'lux') {
      const list = i < 3 ? D.flagship : D.core, free = list.filter(t => !have.includes(t));
      type = (free.length ? free : list)[Math.floor(R() * (free.length ? free : list).length)];
    } else {
      const rareN = have.filter(t => D.rare.includes(t)).length;
      for (let k = 0; k < 12; k++) { type = pickW(D.pool); if (have.filter(t => t === type).length < 2 && !(D.rare.includes(type) && rareN >= 1)) break; }
    }
    const V = VEHICLES[type], color = V.colors[Math.floor(R() * V.colors.length)];
    if (lot !== 'used') return { type, color, cond: 100, km: 0, price: carMsrp(type), vtier: V.tier, bargain: false };
    const cond = Math.round(48 + R() * 49), age = 0.42 + R() * 0.28, bargain = R() < 0.14;
    const km = Math.round((40 + (100 - cond) * 3.2 + R() * 60) * 1000 / 500) * 500;
    let price = carMsrp(type) * age * (0.55 + 0.45 * cond / 100) * (bargain ? 0.62 : 1);
    if (D.rare.includes(type)) price *= 1.15; // older desirable cars hold their value
    price = Math.max(300, Math.round(price / 50) * 50);
    return { type, color, cond, km, price, vtier: cond < 62 && V.tier === 'common' ? 'beater' : V.tier, bargain };
  }
  // new stock on the lot's schedule: the used lot turns over part of its stock, Meridian replaces what sold,
  // the showroom rotates its flagships
  restock(force) {
    const day = this.day;
    for (const lot in DEALERSHIPS) {
      if (!this.place(lot)) continue;
      const D = DEALERSHIPS[lot], st = this.state(lot);
      if (!force && day < st.d + D.every) continue;
      const first = st.d < 0;
      st.d = day;
      const R = this.rng(lot, 99);
      const replace = st.cars.map((c, i) => !c || first || (lot === 'used' && R() < 0.4) || (lot === 'lux' && i < 3));
      for (let i = 0; i < st.cars.length; i++) if (replace[i]) { this.despawnSlot(lot, i); st.cars[i] = null; }
      for (let i = 0; i < st.cars.length; i++) if (replace[i]) st.cars[i] = this.make(lot, i, st.cars.filter(Boolean).map(c => c.type));
    }
  }
  carAt(lot, i) { const v = this.cars.get(lot + ':' + i); return v && this.g.vehicles.list.includes(v) ? v : null; }
  despawnSlot(lot, i) { const v = this.carAt(lot, i); if (v && v !== this.g.player.vehicle) this.g.vehicles.despawn(v); this.cars.delete(lot + ':' + i); }
  cantBuy(lot, c) {
    const g = this.g, s = g.save, C2 = g.content;
    if (lot !== 'used' && C2.repLevel < (CAR_REP[c.type] || 0)) return `Needs ${REP_LEVELS[CAR_REP[c.type]].name} reputation`;
    if (s.garage.length >= C2.garageCap) return C2.garageCap ? 'Garage full' : 'You need a place with parking';
    // Saltworks is a shady lot that takes cash or the bank; the licensed dealers take the bank only (§13)
    if (!Money.can(c.price, lot === 'used' ? 'usedLot' : 'dealer')) return `Costs ${fmtMoney(c.price)}${lot === 'used' ? '' : ' from your bank'}`;
    if (lot !== 'used' && g.police.level > 0) return 'Not with the police on you';
    return '';
  }
  buy(lot, i) {
    const g = this.g, s = g.save, C2 = g.content, st = this.state(lot), c = st.cars[i];
    if (!c) return 'Sold.';
    const why = this.cantBuy(lot, c); if (why) return why;
    Money.pay(c.price, lot === 'used' ? 'usedLot' : 'dealer'); s.stats.carsBought = (s.stats.carsBought || 0) + 1;
    const e = C2.addToGarage(c.type, 'bought', c.color, true);
    e.dmg = clamp(100 - c.cond, 0, 100); e.vtier = c.vtier;
    st.cars[i] = null;
    // the car on the stall becomes yours: unlocked, keys in it
    let v = this.carAt(lot, i); this.cars.delete(lot + ':' + i);
    const sl = this.place(lot).slots[i];
    if (!v) v = g.vehicles.spawn(c.type, sl.x, sl.z, sl.h, { parked: true, color: c.color, vtier: c.vtier });
    v.locked = false; v.dealer = null; v.display = false; v.owned = true; v.touched = true; v.legit = true; v.garageUid = e.uid; v.origin = 'bought'; v.tune = e.tune;
    v.health = Math.max(1, c.cond); v.trunk = e.trunk || (e.trunk = {}); v.looted = true; v.special = !!VEHICLES[c.type].special;
    e.out = true;
    if (g.garageDisplay) g.garageDisplay.cars.set(e.uid, v);
    g.audio.play('cash');
    g.ui.banner(VEHICLES[c.type].name, `Yours · ${fmtMoney(c.price)}`, 'pass', 2.6);
    g.ui.toast(e.at ? `Keys are in it. When you park it at ${PROP_BY_ID[e.at.p] ? PROP_BY_ID[e.at.p].name : 'home'} it’s saved there.` : 'Keys are in it. No free parking space at home yet: it waits in storage when you leave it.', 'money');
    g.saveGame(true);
    return '';
  }
  // the lot car the player is standing next to
  nearCar(p) {
    let best = null, bd = 1.7;
    for (const [k, v] of this.cars) {
      if (!this.g.vehicles.list.includes(v) || v.burnt) continue;
      const lp = v.toLocal(p.pos.x, p.pos.z), d = Math.hypot(Math.max(0, Math.abs(lp.x) - v.spec.w / 2), Math.max(0, Math.abs(lp.z) - v.spec.l / 2));
      if (d < bd) { bd = d; best = { k, v }; }
    }
    if (!best) return null;
    const [lot, i] = best.k.split(':'), c = this.state(lot).cars[+i];
    return c ? { lot, i: +i, c, v: best.v } : null;
  }
  update(dt) {
    const g = this.g, p = g.player; if (!g.uw || g.state !== 'playing') return;
    this.t -= dt;
    // the flagship turns slowly on its turntable while you look at it
    for (const [k, v] of this.cars) if (v.dealer && v.dealer.turn && g.vehicles.list.includes(v) && v.sleep) { v.h += dt * 0.25; v.syncMesh(0); }
    if (this.t > 0) return; this.t = 0.5;
    this.restock();
    const inside = p.interior && !p.interior.vspace;
    for (const lot in DEALERSHIPS) {
      const pl = this.place(lot); if (!pl) continue;
      const st = this.state(lot), near = !inside && Math.hypot(pl.door.x - p.pos.x, pl.door.z - p.pos.z) < 150;
      st.cars.forEach((c, i) => {
        const key = lot + ':' + i, v = this.cars.get(key), alive = v && g.vehicles.list.includes(v) && v.dealer && v.dealer.lot === lot;
        if (alive && (v.burnt || v.health <= 0)) { this.cars.delete(key); st.cars[i] = null; return; } // written off: the stall waits for new stock
        if (!c) { if (alive) this.despawnSlot(lot, i); return; }
        if (near && !alive) {
          const sl = pl.slots[i];
          for (const o of g.vehicles.nearby(sl.x, sl.z, 3.5)) if (o !== p.vehicle && o !== p.lastVehicle && !o.garageUid && !o.mission && !o.dealer) g.vehicles.despawn(o);
          const nv = g.vehicles.spawn(c.type, sl.x, sl.z, sl.h, { parked: true, color: c.color, vtier: c.vtier });
          nv.locked = true; nv.touched = true; nv.display = true; nv.looted = true; nv.dealer = { lot, i, turn: !!sl.turn };
          this.cars.set(key, nv);
        } else if (!near && alive && v !== p.vehicle) this.despawnSlot(lot, i);
        else if (!alive && v) this.cars.delete(key);
      });
    }
  }
}

/* The stored cars you can see: spawned in their bays near you, taken out by driving off,
   towed home when abandoned far away. */
class GarageDisplay {
  constructor(g) { this.g = g; this.cars = new Map(); this.t = 0; }
  get PM() { return this.g.uw.props; }
  entryOf(v) { return v.garageUid ? this.g.save.garage.find(e => e.uid === v.garageUid) : null; }
  bayPos(e) { const def = PROP_BY_ID[e.at.p]; return def ? this.PM.bays(def)[e.at.i] : null; }
  spawnFor(e, b) {
    const g = this.g;
    for (const v of g.vehicles.list) if (v.garageUid === e.uid) { v.trunk = e.trunk || (e.trunk = {}); return v; }
    // clear anything parked in the bay first (never the player's car)
    for (const v of g.vehicles.nearby(b.x, b.z, 4)) if (v !== g.player.vehicle && !v.garageUid && !v.mission && Math.hypot(v.pos.x - b.x, v.pos.z - b.z) < 3 && Math.abs(v.pos.y - (b.y ?? v.pos.y)) < 2) g.vehicles.despawn(v);
    const v = g.vehicles.spawn(e.type, b.x, b.z, b.h, { parked: true, color: e.color, y: b.y, vtier: e.vtier || VEHICLES[e.type].tier });
    v.owned = true; v.touched = true; v.garageUid = e.uid; v.tune = e.tune; v.origin = e.origin; v.health = Math.max(1, 100 - e.dmg);
    v.trunk = e.trunk || (e.trunk = {}); v.looted = true; v.special = !!VEHICLES[e.type].special; v.display = true;
    if (e.dmg >= 100) { v.health = 0; v.burnt = false; }
    this.cars.set(e.uid, v);
    return v;
  }
  update(dt) {
    const g = this.g, s = g.save, p = g.player; if (!g.uw || g.state !== 'playing') return;
    this.t -= dt; if (this.t > 0) return; this.t = 0.4;
    if (s.garage.some(e => !e.at)) this.PM.assignBays();
    const px = p.pos.x, pz = p.pos.z, py = p.pos.y;
    for (const e of s.garage) {
      if (!e.at) continue;
      const b = this.bayPos(e); if (!b) continue;
      const v = this.cars.get(e.uid);
      const alive = v && g.vehicles.list.includes(v) && v.garageUid === e.uid;
      if (!alive) this.cars.delete(e.uid);
      else if (v.trunk !== e.trunk) v.trunk = e.trunk || (e.trunk = {});
      // in use: leaving the bay takes the car out; it stays yours wherever you leave it
      if (alive && !e.out) { const d = Math.hypot(v.pos.x - b.x, v.pos.z - b.z); if (d > 7 || Math.abs(v.pos.y - (b.y ?? v.pos.y)) > 3) { e.out = true; v.display = false; g.autosave('Vehicle taken out'); } }
      if (alive && e.out) {
        e.dmg = clamp(100 - v.health, 0, 100);
        const far = Math.hypot(v.pos.x - px, v.pos.z - pz) > 340 && v !== p.vehicle && v !== p.lastVehicle;
        if (far && !g.inView(v.pos.x, 1, v.pos.z, 3)) { g.vehicles.despawn(v); this.cars.delete(e.uid); e.out = false; }
        continue;
      }
      if (e.out && !alive) e.out = false; // gone without us noticing: it is back in its bay
      const near = Math.hypot(b.x - px, b.z - pz) < 150 && Math.abs((b.y ?? 0) - py) < (b.kind === 'under' ? 20 : 60) && (b.kind === 'under' ? p.interior && p.interior.vspace === b.space : !(p.interior && p.interior.vspace));
      if (near && !alive) this.spawnFor(e, b);
      else if (!near && alive && v !== p.vehicle && v !== p.lastVehicle && !e.out) { g.vehicles.despawn(v); this.cars.delete(e.uid); }
    }
  }
  clearAll() { for (const v of this.cars.values()) if (this.g.vehicles.list.includes(v) && v !== this.g.player.vehicle) this.g.vehicles.despawn(v); this.cars.clear(); }
}
