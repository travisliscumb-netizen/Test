/* =====================================================================
   [CORE] ISLAND FLEET (Operation Blackgate)
   The vehicles that stand at the island's own places (world.isle.fleet,
   listed by the generator in 127): race cars in the Valen Point pits and
   paddock and at the proving ground, aircraft at the airport, a helicopter
   on the hospital's and the police station's roofs, fire engines and
   ambulances, the cars of each settlement. Like the city's parked cars
   they appear as you come within reach of a site and go again when you
   leave, unless you touched them; one you took is back in its place the
   next time you come by.
   ===================================================================== */
class IslandFleet {
  constructor(game) { this.g = game; this.sites = game.world.isle.fleet; this.live = new Map(); }
  // what stands in a slot: its own class, or (a settlement's driveway) what parks in the city, by the same rolls
  typeOf(site, si, k, s) {
    if (s.cls) return s.cls;
    const hh = hash2i(si + 400, k, 31);
    if (hash2i(si + 400, k, 35) < (RARE_ZONES[zoneKey(s.x, s.z)] || 0)) return RARE_TYPES[Math.floor(hash2i(si + 400, k, 34) * RARE_TYPES.length)];
    return CIVIL_TYPES[Math.floor(hh * CIVIL_TYPES.length)];
  }
  update(fx, fz) {
    const g = this.g, V = g.vehicles, p = g.player;
    this.sites.forEach((site, si) => {
      const d = Math.hypot(site.x - fx, site.z - fz), cars = this.live.get(site.id);
      if (cars && d > site.r + 70) {
        for (const v of cars) if (V.list.includes(v) && !v.touched && v.driver === null && !v.mission && v !== p.lastVehicle) V.despawn(v);
        this.live.delete(site.id);
      } else if (!cars && d < site.r) {
        const out = [];
        site.slots.forEach((s, k) => {
          if (Math.hypot(s.x - p.pos.x, s.z - p.pos.z) < 5) return;
          for (const v of V.list) if (dist2(v.pos.x, v.pos.z, s.x, s.z) < 12) return;
          const type = this.typeOf(site, si, k, s), spec = VEHICLES[type];
          const v = V.spawn(type, s.x, s.z, s.h, { parked: true, y: s.y, vtier: spec.tier, color: spec.colors[Math.floor(hash2i(si + 400, k, 32) * spec.colors.length)] });
          v.homeBlock = -1; v.fleet = site.id;
          out.push(v);
        });
        this.live.set(site.id, out);
      }
    });
  }
  // every site's cars at once (the tests, the screenshots)
  spawnAll() { this.sites.forEach(s => { const x = s.x, z = s.z; this.live.delete(s.id); this.update(x, z); }); }
}
