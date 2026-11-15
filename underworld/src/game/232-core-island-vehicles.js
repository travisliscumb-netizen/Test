/* =====================================================================
   [CORE+CONTENT] THE ISLAND'S VEHICLES (Operation Blackgate)
   - Competition cars (the Valen Point pits and paddock, the proving
     ground): a GT racer, a cup car, a prototype, an open-wheeler, a rally
     car, a drift car. Track property: they can be taken and driven, not
     kept (no cargo class, no chop value, never in a collection).
   - Emergency vehicles: an ambulance and a fire engine (the horn works
     their lights).
   - Aircraft: the Skylark (a light aeroplane) and the Kestrel helicopter
     in three liveries. They are vehicles like any other (you walk up,
     get in, steal them) with their own geometry, a spinning propeller or
     rotors, and flight physics of their own in place of the car's
     (Flight, below): the aeroplane needs a take-off run and stalls when
     it is slow; the helicopter spools up, lifts straight off and hovers.
   ===================================================================== */
Object.assign(VEHICLES, {
  gt3: { rev: 0.33, name: 'Zephyr GT3', l: 4.55, w: 2.02, h: 1.14, mass: 1240, power: 21500, drift: 0.06, vmax: 88, steer: 0.56, grip: 1.66, brake: 22, soft: 0.4, wheelR: 0.35, camDist: 6.4, camH: 1.5, eng: 1.8, price: 0, profile: 'super', wing: 'swan', louvers: true, dualExhaust: true, tier: 'sport', fleet: true, race: 'GT',
    colors: [0xc8102e, 0x1c3f94, 0xf2c230, 0xeeeeee], blurb: 'A Zephyr with everything road-legal taken off it.' },
  cup: { rev: 0.36, name: 'Apex Cup', l: 4.05, w: 1.86, h: 1.4, mass: 1050, power: 12500, drift: 0.08, vmax: 70, steer: 0.62, grip: 1.55, brake: 20, soft: 0.5, wheelR: 0.33, camDist: 6.0, camH: 1.65, eng: 1.55, price: 0, profile: 'hothatch', wing: 'roof', tier: 'sport', fleet: true, race: 'Cup',
    colors: [0x2a6fd6, 0xf39c12, 0x27ae60, 0xeeeeee], blurb: 'One-make cup racer: a roll cage, slicks and no back seat.' },
  lmp: { rev: 0.32, name: 'Halcyon LMP', l: 4.7, w: 2.0, h: 1.04, mass: 930, power: 22500, drift: 0.04, vmax: 96, steer: 0.56, grip: 1.8, brake: 24, soft: 0.35, wheelR: 0.35, camDist: 6.6, camH: 1.45, eng: 1.9, price: 0, profile: 'hyper', wing: 'swan', sideIntakes: true, tier: 'sport', fleet: true, race: 'Prototype',
    colors: [0x17202a, 0xe8e8e8, 0xc8102e], blurb: 'An endurance prototype. It makes its grip from the air.' },
  formula: { rev: 0.3, name: 'Valen FR-1', l: 4.7, w: 1.9, h: 1.0, mass: 720, power: 19500, drift: 0.03, vmax: 92, steer: 0.6, grip: 1.95, brake: 26, soft: 0.3, wheelR: 0.33, camDist: 6.0, camH: 1.35, eng: 2.0, price: 0, profile: 'roadster', build: 'formula', tier: 'sport', fleet: true, race: 'Open-wheel',
    colors: [0xc8102e, 0x1c3f94, 0xf2c230, 0x111418], blurb: 'Open wheels, wings front and rear, one seat.' },
  rally: { rev: 0.38, name: 'Mesa RX', l: 4.1, w: 1.88, h: 1.46, mass: 1180, power: 13800, drift: 0.28, vmax: 66, steer: 0.62, grip: 1.34, brake: 18, soft: 1.25, wheelR: 0.35, camDist: 6.1, camH: 1.75, eng: 1.5, price: 0, profile: 'hothatch', wing: 'roof', scoop: true, tier: 'sport', fleet: true, race: 'Rally',
    colors: [0x1c3f94, 0xeeeeee, 0xd8a227], blurb: 'Long springs, short gears. As quick on gravel as on the road.' },
  drift: { rev: 0.35, name: 'Brakken Drift', l: 4.8, w: 1.92, h: 1.28, mass: 1450, power: 17500, drift: 0.62, vmax: 70, steer: 0.6, grip: 1.0, brake: 15, soft: 0.8, wheelR: 0.35, camDist: 6.6, camH: 1.7, eng: 0.74, price: 0, profile: 'muscle', wing: 'lip', scoop: true, tier: 'sport', fleet: true, race: 'Drift',
    colors: [0x8e44ad, 0x17202a, 0xf39c12], blurb: 'More lock, more power, less grip: it goes sideways on purpose.' },
  ambulance: { rev: 0.45, name: 'St. Alda Ambulance', l: 5.4, w: 2.05, h: 2.35, mass: 2700, power: 11500, drift: 0.04, vmax: 48, steer: 0.48, grip: 0.9, brake: 11, soft: 1.5, wheelR: 0.38, camDist: 8.2, camH: 2.5, eng: 0.75, price: 0, profile: 'van', ems: 1, paint2: 0xd02a3a, tier: 'nice', fleet: true,
    colors: [0xf2f4f6], blurb: 'Lights, a siren and right of way.' },
  firetruck: { rev: 0.5, name: 'Engine 9', l: 7.4, w: 2.4, h: 3.2, mass: 7800, power: 30000, drift: 0.04, vmax: 38, steer: 0.42, grip: 0.82, brake: 9, soft: 1.4, wheelR: 0.5, camDist: 11.5, camH: 3.7, eng: 0.48, price: 0, profile: 'truck', ems: 2, paint2: 0xe8e8e8, armorK: 1.5, tier: 'nice', fleet: true,
    colors: [0xc8102e], blurb: 'Eight tonnes of pump and ladder.' },
  // aircraft: l and w are the fuselage (what the collision circles cover); flight: the numbers Flight flies them by
  skylark: { rev: 0.5, name: 'Skylark 180', l: 7.4, w: 1.9, h: 2.7, mass: 1100, power: 0, drift: 0, vmax: 78, steer: 0.4, grip: 1, brake: 9, soft: 1, wheelR: 0.24, camDist: 15, camH: 3.3, eng: 0.9, price: 0, profile: 'sedan', build: 'plane', air: 'plane', tier: 'nice', fleet: true, armorK: 0.7,
    flight: { thrust: 6.4, drag: 0.00105, vStall: 25, pitchRate: 0.95, rollRate: 1.9, align: 2.6, span: 10.8 },
    colors: [0xf2f4f6, 0xf2c230, 0xc8102e, 0x2a6fd6], paint2: 0x1c3f94, blurb: 'Four seats, one propeller, 180 horsepower: the island from above.' },
  heli: { rev: 0.5, name: 'Kestrel', l: 6.6, w: 2.2, h: 3.3, mass: 1500, power: 0, drift: 0, vmax: 58, steer: 0.4, grip: 1, brake: 9, soft: 1, wheelR: 0.2, camDist: 13.5, camH: 3.4, eng: 0.6, price: 0, profile: 'sedan', build: 'heli', air: 'heli', noWheels: true, tier: 'nice', fleet: true, armorK: 0.7,
    flight: { climb: 9, sink: 8, acc: 8, yaw: 1.5, vBack: 12, rotor: 5.3 },
    colors: [0x17202a, 0xc8102e, 0x2a6fd6], paint2: 0xe8e8e8, blurb: 'A light turbine helicopter. Lands on a roof, a beach or a traffic island.' }
});
VEHICLES.medevac = Object.assign({}, VEHICLES.heli, { name: 'Kestrel Medevac', colors: [0xf2f4f6], paint2: 0xd02a3a, blurb: 'St. Alda’s air ambulance.' });
VEHICLES.polheli = Object.assign({}, VEHICLES.heli, { name: 'Kestrel Air Unit', colors: [0x14233f], paint2: 0xf4f6f7, polAir: true, blurb: 'The department’s eye in the sky.' });
TRAIL.rally = 0.75;
// custom bodies (a spec's `build`): the profile extruder cannot make an open-wheeler or anything with wings
const ISLE_BUILD = {
  formula(type) {
    const s = VEHICLES[type], g = new GeoBuilder({ part: true }), R = s.wheelR, P = part => ({ part });
    const tube = (x, y, z, r, len, part, rx = Math.PI / 2, tpl = TPL.cyl) => g.add(tpl, M(x, y, z, r, len, r, 0, rx), null, P(part));
    // the tub and the engine cover, the nose and its cone, the airbox, the cockpit's rim and the driver's helmet
    g.box(0, 0.42, -0.1, 0.92, 0.42, 2.5, null, 0, P(0)); g.box(0, 0.6, -1.2, 0.66, 0.5, 1.5, null, 0, P(0)); g.box(0, 0.4, 1.55, 0.5, 0.26, 1.2, null, 0, P(0));
    tube(0, 0.36, 2.5, 0.2, 0.8, 0, Math.PI / 2, TPL.cone); g.box(0, 0.98, -0.75, 0.3, 0.3, 0.5, null, 0, P(10));
    g.box(0, 0.66, 0.22, 0.6, 0.1, 0.9, null, 0, P(2)); g.add(TPL.sphere, M(0, 0.86, 0.1, 0.16, 0.17, 0.2), null, P(10));
    // side pods, the floor, the wings (two elements at the rear on end plates), the rain light
    for (const sx of [-1, 1]) { g.box(sx * 0.68, 0.38, -0.35, 0.44, 0.34, 1.7, null, 0, P(0)); g.box(sx * 0.68, 0.38, 0.52, 0.4, 0.26, 0.08, null, 0, P(15)); g.box(sx * 0.78, 0.62, -2.05, 0.04, 0.56, 0.6, null, 0, P(10)); g.box(sx * 0.86, 0.2, 2.42, 0.04, 0.2, 0.52, null, 0, P(10)); }
    g.box(0, 0.12, -0.2, 1.5, 0.05, 3.4, null, 0, P(14)); g.box(0, 0.16, 2.42, 1.76, 0.04, 0.46, null, 0, P(10)); g.box(0, 0.24, 2.3, 1.7, 0.03, 0.22, null, 0, P(0));
    g.box(0, 0.86, -2.05, 1.56, 0.04, 0.44, null, 0, P(10)); g.box(0, 0.7, -2.15, 1.56, 0.03, 0.3, null, 0, P(0)); g.box(0, 0.34, -2.34, 0.12, 0.1, 0.06, null, 0, P(5));
    // suspension arms out to the open wheels
    const wb = 3.0, tr = s.w / 2 - 0.16;
    for (const z of [wb / 2, -wb / 2]) for (const sx of [-1, 1]) for (const dz of [-0.22, 0.22]) g.add(TPL.box, M(sx * (tr + 0.35) / 2 + sx * 0.1, R + 0.04, z + dz / 2, tr - 0.5, 0.035, 0.05, sx * dz * 0.5), null, P(2));
    const geo = g.build(); creaseNormals(geo, [0, 10]);
    return { geo, lod: geo, wheels: [[tr, wb / 2], [-tr, wb / 2], [tr, -wb / 2], [-tr, -wb / 2]], yb: 0.12, zf: 2.9, zr: -2.4, frontTop: 0.5, rearTop: 0.9, cabTop: 1.0 };
  },
  plane(type) {
    const s = VEHICLES[type], g = new GeoBuilder({ part: true }), P = part => ({ part }), Y = 1.36, span = s.flight.span;
    const tube = (x, y, z, rx0, len, rz0, part, rx = Math.PI / 2, tpl = TPL.cyl) => g.add(tpl, M(x, y, z, rx0, len, rz0, 0, rx), null, P(part));
    // the cabin, the cowl and spinner, the tail cone; the windscreen and side windows as one glasshouse under the wing
    tube(0, Y, 0.35, 0.74, 3.3, 0.8, 0); tube(0, Y - 0.04, 2.55, 0.62, 1.2, 0.66, 0); tube(0, Y, 3.36, 0.24, 0.5, 0.24, 3, Math.PI / 2, TPL.cone);
    tube(0, Y + 0.08, -3.2, 0.7, 3.9, 0.72, 0, -Math.PI / 2, TPL.cone);
    g.box(0, Y + 0.62, 0.75, 1.22, 0.56, 2.0, null, 0, P(1)); g.box(0, Y + 0.93, 0.7, 1.3, 0.08, 2.2, null, 0, P(0));
    // the high wing with coloured tips, its struts, the tailplane and the fin with its rudder stripe
    g.box(0, Y + 1.0, 0.55, span, 0.15, 1.5, null, 0, P(0));
    for (const sx of [-1, 1]) { g.box(sx * (span / 2 - 0.45), Y + 1.0, 0.55, 0.9, 0.17, 1.54, null, 0, P(10)); g.add(TPL.box, M(sx * 1.7, Y + 0.4, 0.6, 0.07, 2.6, 0.12, 0, 0, sx * 1.02), null, P(2)); }
    g.box(0, Y + 0.2, -4.75, 3.5, 0.09, 0.95, null, 0, P(0)); g.add(TPL.box, M(0, Y + 0.95, -4.7, 0.11, 1.6, 1.15, 0, -0.28), null, P(10));
    // the undercarriage: two main legs and a nose leg (the wheels themselves are the manager's)
    for (const sx of [-1, 1]) g.add(TPL.box, M(sx * 0.82, 0.62, 0.2, 0.09, 1.05, 0.16, 0, 0, -sx * 0.62), null, P(2));
    g.box(0, 0.52, 2.4, 0.09, 0.72, 0.09, null, 0, P(2));
    // the lamps: landing light in the cowl, red and green at the tips, a white tail light
    g.box(0, Y - 0.38, 3.08, 0.2, 0.12, 0.06, null, 0, P(4)); g.box(span / 2 - 0.02, Y + 1.0, 0.55, 0.06, 0.1, 0.3, null, 0, P(5)); g.box(-span / 2 + 0.02, Y + 1.0, 0.55, 0.06, 0.1, 0.3, null, 0, P(12));
    const geo = g.build(); creaseNormals(geo, [0, 1, 10]);
    return { geo, lod: geo, wheels: [[0.13, 2.4], [-0.13, 2.4], [1.18, 0.2], [-1.18, 0.2]], yb: 0.6, zf: 3.6, zr: -5.2, frontTop: Y + 0.6, rearTop: Y + 0.8, cabTop: Y + 1.1 };
  },
  heli(type) {
    const g = new GeoBuilder({ part: true }), P = part => ({ part });
    // the cabin and its bubble, the engine cowl, the tail boom, the fin and tailplane, the mast, the skids
    g.add(TPL.sphere, M(0, 1.5, 0.75, 1.06, 0.98, 1.85), null, P(0)); g.add(TPL.sphere, M(0, 1.62, 1.55, 0.98, 0.84, 1.18), null, P(1));
    g.box(0, 2.42, 0.1, 1.06, 0.55, 2.0, null, 0, P(10)); g.add(TPL.cyl, M(0, 1.92, -3.3, 0.22, 4.8, 0.24, 0, Math.PI / 2), null, P(0));
    g.add(TPL.box, M(0, 2.4, -5.5, 0.1, 1.5, 0.75, 0, -0.3), null, P(10)); g.box(0, 1.92, -4.9, 1.6, 0.07, 0.42, null, 0, P(0)); g.add(TPL.cyl6, M(0, 2.95, 0.15, 0.1, 0.55, 0.1), null, P(2));
    for (const sx of [-1, 1]) { g.box(sx * 0.98, 0.06, 0.55, 0.1, 0.1, 3.3, null, 0, P(3)); for (const z of [1.5, -0.4]) g.add(TPL.box, M(sx * 0.78, 0.5, z, 0.07, 0.95, 0.07, 0, 0, -sx * 0.42), null, P(2)); }
    // lamps: a nose light, a red beacon under the boom, the police unit's and the air ambulance's flashers on the belly
    g.box(0, 0.86, 2.36, 0.24, 0.14, 0.08, null, 0, P(4)); g.box(0, 1.6, -5.72, 0.08, 0.1, 0.06, null, 0, P(5)); g.box(-0.3, 0.6, 0.6, 0.3, 0.1, 0.3, null, 0, P(7)); g.box(0.3, 0.6, 0.6, 0.3, 0.1, 0.3, null, 0, P(8));
    const geo = g.build(); creaseNormals(geo, [0, 1, 10]);
    return { geo, lod: geo, wheels: [[0.9, 1.5], [-0.9, 1.5], [0.9, -0.5], [-0.9, -0.5]], yb: 0.5, zf: 2.6, zr: -5.9, frontTop: 1.6, rearTop: 2.2, cabTop: 2.7 };
  }
};
// the spinning parts (children of the body's mesh): a propeller, or a main and a tail rotor, each with a faint disc
function makeRotors(v) {
  const s = v.spec, steel = new THREE.MeshStandardMaterial({ color: 0x22262b, roughness: 0.5, metalness: 0.4 }), disc = new THREE.MeshBasicMaterial({ color: 0x1a1c20, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide });
  const R = {}, blur = r => new THREE.Mesh(new THREE.CircleGeometry(r, 24), disc);
  if (s.air === 'plane') {
    const hub = new THREE.Group(); hub.position.set(0, 1.36, 3.5);
    hub.add(new THREE.Mesh(new THREE.BoxGeometry(1.95, 0.17, 0.05), steel)); hub.add(blur(1.0));
    v.mesh.add(hub); R.main = hub; R.axis = 'z'; R.disc = disc;
  } else {
    const hub = new THREE.Group(); hub.position.set(0, 3.24, 0.15);
    for (const a of [0, Math.PI / 2]) { const b = new THREE.Mesh(new THREE.BoxGeometry(s.flight.rotor * 2, 0.05, 0.3), steel); b.rotation.y = a; hub.add(b); }
    const d = blur(s.flight.rotor); d.rotation.x = -Math.PI / 2; hub.add(d);
    const tail = new THREE.Group(); tail.position.set(0.2, 2.42, -5.62);
    tail.add(new THREE.Mesh(new THREE.BoxGeometry(0.04, 1.3, 0.14), steel)); const d2 = blur(0.66); d2.rotation.y = Math.PI / 2; tail.add(d2);
    v.mesh.add(hub); v.mesh.add(tail); R.main = hub; R.tail = tail; R.axis = 'y'; R.disc = disc;
  }
  return R;
}
/* ---------------- Flight: the aircraft's physics in place of the car's ----------------
   v.air: { on (engine / rotor, 0..1), thr (the aeroplane's throttle), vy, pitch (nose up +), bank (right wing down +),
   grounded, agl (height over what is under it) }. v.vel stays the horizontal velocity, so everything that reads a
   vehicle's speed and position still works; v.airborne stays false (that flag is the car's jump). */
const Flight = {
  G: 14,
  _q: [], _res: {},
  init(v) { v.air = { on: 0, thr: 0, vy: 0, pitch: 0, bank: 0, grounded: true, agl: 0, warn: 0 }; v.ctl.pitch = 0; v.ctl.lift = 0; },
  // what an aircraft at height y over (x, z) would come down on: the ground or a deck at its level, or a roof below it
  ground(world, x, z, y) {
    let g = groundY(x, z, y + 0.5, 1.5);
    for (const c of world.grid.query(x - 0.5, z - 0.5, x + 0.5, z + 0.5, this._q)) if (c.kind === 'bld' && c.x0 !== undefined && x >= c.x0 && x <= c.x1 && z >= c.z0 && z <= c.z1 && c.y1 <= y + 1.2 && c.y1 > g) g = c.y1;
    return g;
  },
  // set down where it stands (a spawn, a reset)
  place(v, world) { const A = v.air; v.pos.y = this.ground(world, v.pos.x, v.pos.z, v.pos.y); A.vy = 0; A.pitch = 0; A.bank = 0; A.grounded = true; A.agl = 0; this.wheels(v, world); },
  wheels(v, world) { const W = v.vg.wheels, c = Math.cos(v.h), s = Math.sin(v.h); for (let i = 0; i < 4; i++) v._wy[i] = v.air.grounded ? this.ground(world, v.pos.x + W[i][0] * c + W[i][1] * s, v.pos.z - W[i][0] * s + W[i][1] * c, v.pos.y) : -1e6; },
  // a hard arrival: damage by how fast it came down (or what it flew into); beyond the limit it is a wreck
  arrive(v, game, sink, limit, wreck) {
    if (sink > limit) { v.hurt((sink - limit) * 16, 'land'); game.fx.sparks(v.pos.x, v.pos.y + 0.3, v.pos.z, 14); game.audio.play('crash', { x: v.pos.x, z: v.pos.z, k: clamp(sink / 14, 0.3, 1) }); if (v.driver === 'player') game.cam.shake(clamp(sink / 14, 0.2, 0.9)); }
    else if (sink > 2) game.audio.play('thud', { x: v.pos.x, z: v.pos.z, gain: 0.6 });
    if (wreck || v.health <= 0) { v.health = 0; game.fx.explodeVehicle(v); }
  },
  step(v, dt, game) {
    const s = v.spec, A = v.air, F = s.flight, ctl = v.ctl, world = game.world, dead = v.burnt || v.health <= 0, flown = v.driver === 'player' && !dead;
    if (!flown) { ctl.throttle = 0; ctl.steer = 0; ctl.pitch = 0; ctl.lift = 0; }
    A.on = clamp(A.on + (flown ? dt / (s.air === 'heli' ? 2.6 : 1.4) : -dt / 3), 0, 1);
    const h0 = v.h, gy = this.ground(world, v.pos.x, v.pos.z, v.pos.y);
    let vx = v.vel.x, vz = v.vel.y, vy = A.vy;
    const sh = Math.sin(v.h), ch = Math.cos(v.h);
    if (s.air === 'plane') {
      A.thr = flown ? clamp(A.thr + ctl.throttle * 0.6 * dt, 0, 1) : Math.max(0, A.thr - dt);
      const cp = Math.cos(A.pitch), sp = Math.sin(A.pitch), fx = sh * cp, fy = sp, fz = ch * cp;
      const speed = Math.hypot(vx, vy, vz), vf = vx * fx + vy * fy + vz * fz, q = clamp(vf / F.vStall, 0, 1.3), lift = Math.min(q * q, 1), auth = clamp(q, 0, 1);
      const thrust = F.thrust * A.thr * A.on * (v.health > 45 ? 1 : 0.7);
      if (A.grounded) {
        // on its wheels: the ground carries it; the tyres hold it straight, the nose wheel steers, S brakes (and backs it up slowly)
        let f = vx * sh + vz * ch, l = vx * -ch + vz * sh;
        const te = Terrain.effect(v.pos.x, v.pos.z, 0), roll = 0.5 + (te ? te.drag * 2.5 : 0), braking = flown && ctl.throttle < -0.1 && A.thr <= 0.001;
        f += (thrust - F.drag * f * Math.abs(f)) * dt;
        const dec = (roll + (braking && f > 0.3 ? 9 : 0) + (flown ? 0 : 3)) * dt; f = Math.abs(f) <= dec ? 0 : f - Math.sign(f) * dec;
        if (braking && f <= 0.3) f = Math.max(-3.5, f - 4 * dt);
        l *= Math.exp(-9 * dt);
        v.h += ctl.steer * clamp(f / 7, -1, 1) * (1.05 - 0.6 * auth) * dt;
        const sh2 = Math.sin(v.h), ch2 = Math.cos(v.h); vx = sh2 * f - ch2 * l; vz = ch2 * f + sh2 * l; vy = 0;
        // the nose comes up with the stick once there is air over the tail; it flies itself off a little above the stall
        A.pitch = damp(A.pitch, clamp(ctl.pitch, 0, 1) * 0.2 * auth, 5, dt); A.bank = damp(A.bank, 0, 8, dt);
        v.pos.x += vx * dt; v.pos.z += vz * dt; v.pos.y = this.ground(world, v.pos.x, v.pos.z, v.pos.y + 0.6);
        if ((q >= 1 && A.pitch > 0.07) || q > 1.22) { A.grounded = false; v.pos.y += 0.06; vy = Math.max(1.2, f * Math.sin(A.pitch) * 0.7); }
        v.braking = braking; v.spin += f * dt / s.wheelR; v.steer = damp(v.steer, ctl.steer * 0.5, 9, dt);
      } else {
        // in the air: thrust along the nose, drag against the path, the weight the wings do not carry, speed traded
        // for height, the lift's sideways part in a bank
        const dr = F.drag * speed * (1 + 1.5 * Math.abs(sp));
        let ax = fx * thrust - vx * dr, ay = fy * thrust - vy * dr - this.G * (1 - lift), az = fz * thrust - vz * dr;
        if (speed > 1) { const e = this.G * lift * vy / speed; ax -= vx / speed * e; ay -= vy / speed * e; az -= vz / speed * e; }
        const side = this.G * lift * Math.sin(A.bank); ax -= ch * side; az += sh * side;
        if (v.pos.y > 620) ay -= (v.pos.y - 620) * 0.06;
        vx += ax * dt; vy += ay * dt; vz += az * dt;
        // the wings pull the path round to where the nose points (not when they are stalled)
        const sp2 = Math.hypot(vx, vy, vz), k = 1 - Math.exp(-F.align * lift * dt);
        if (sp2 > 1 && vf > 0) { let nx = vx / sp2 + (fx - vx / sp2) * k, ny = vy / sp2 + (fy - vy / sp2) * k, nz = vz / sp2 + (fz - vz / sp2) * k; const nl = Math.hypot(nx, ny, nz) || 1; vx = nx / nl * sp2; vy = ny / nl * sp2; vz = nz / nl * sp2; }
        // stick: roll and pitch by how much air there is; hands off, the wings level themselves; stalled, the nose drops
        if (Math.abs(ctl.steer) > 0.05) A.bank = clamp(A.bank - ctl.steer * F.rollRate * (0.35 + 0.65 * auth) * dt, -1.2, 1.2); else A.bank = damp(A.bank, 0, 1.3, dt);
        A.pitch = clamp(A.pitch + ctl.pitch * F.pitchRate * (0.3 + 0.7 * auth) * dt, -1.05, 1.05);
        if (Math.abs(ctl.pitch) < 0.05) A.pitch = damp(A.pitch, clamp(A.pitch, -0.5, 0.5), 0.5, dt);
        if (q < 0.9) A.pitch -= (0.9 - q) * 1.5 * dt;
        v.h -= this.G * Math.tan(A.bank) / Math.max(vf, F.vStall * 0.8) * lift * dt;
        v.pos.x += vx * dt; v.pos.z += vz * dt; v.pos.y += vy * dt;
        const g2 = this.ground(world, v.pos.x, v.pos.z, v.pos.y + 0.6);
        if (v.pos.y <= g2) {
          // touchdown: gently and wings level it is a landing; too hard, banked over or nose first, it is a crash
          const sink = Math.max(0, -vy), bad = sink > 11 || Math.abs(A.bank) > 0.55 || A.pitch < -0.3 || (g2 < SEA_Y - 0.4);
          v.pos.y = g2; A.grounded = true; vy = 0; this.arrive(v, game, sink, 4.5, bad);
        }
        v.braking = false; v.spin += 6 * dt;
      }
    } else {
      // the helicopter: collective up and down, the cyclic forward and back, the pedals turn it
      const lifted = A.on > 0.9 && !dead;
      let f = vx * sh + vz * ch, l = vx * -ch + vz * sh;
      if (A.grounded) {
        const dec = 12 * dt; f = Math.abs(f) <= dec ? 0 : f - Math.sign(f) * dec; l *= Math.exp(-10 * dt); vy = 0;
        A.pitch = damp(A.pitch, 0, 6, dt); A.bank = damp(A.bank, 0, 6, dt);
        if (lifted && ctl.lift > 0.1) { A.grounded = false; vy = 1.5; v.pos.y += 0.05; }
        if (lifted) v.h += ctl.steer * F.yaw * 0.5 * dt;
      } else {
        if (lifted) {
          const want = ctl.lift > 0 ? ctl.lift * F.climb : ctl.lift * F.sink; vy += clamp(want - vy, -11 * dt, 11 * dt);
          const tf = ctl.throttle >= 0 ? ctl.throttle * s.vmax : ctl.throttle * F.vBack, acc = Math.abs(ctl.throttle) > 0.05 ? F.acc : 2.4;
          f += clamp(tf - f, -acc * dt, acc * dt); l *= Math.exp(-1.8 * dt);
          v.h += ctl.steer * F.yaw * (1 - 0.5 * clamp(Math.abs(f) / s.vmax, 0, 1)) * dt;
          A.pitch = damp(A.pitch, -(clamp((tf - f) / 22, -1, 1) * 0.2 + f / s.vmax * 0.16), 4, dt);
          A.bank = damp(A.bank, -ctl.steer * 0.36 * clamp(Math.abs(f) / 18, 0, 1), 3, dt);
          if (v.pos.y > 520) vy -= (v.pos.y - 520) * 0.08 * dt * 10;
        } else { vy -= this.G * dt; f *= Math.exp(-0.3 * dt); A.pitch = damp(A.pitch, -0.2, 1, dt); v.h += (1 - A.on) * 1.6 * dt; }
      }
      const sh2 = Math.sin(v.h), ch2 = Math.cos(v.h); vx = sh2 * f - ch2 * l; vz = ch2 * f + sh2 * l;
      v.pos.x += vx * dt; v.pos.z += vz * dt; v.pos.y += vy * dt;
      const g2 = this.ground(world, v.pos.x, v.pos.z, v.pos.y + 0.6);
      if (A.grounded) v.pos.y = g2;
      else if (v.pos.y <= g2) { const sink = Math.max(0, -vy), hs = Math.hypot(vx, vz); v.pos.y = g2; A.grounded = true; vy = 0; this.arrive(v, game, sink + Math.max(0, hs - 6) * 0.6, 5, sink > 13 || hs > 22 || g2 < SEA_Y - 0.4); }
      v.braking = false;
    }
    // the island ends: a headwind that grows with every metre past the edge of the map turns it back
    const ox = Math.max(ISLE.x0 - 300 - v.pos.x, 0) - Math.max(v.pos.x - ISLE.x1 - 300, 0), oz = Math.max(ISLE.z0 - 300 - v.pos.z, 0) - Math.max(v.pos.z - ISLE.z1 - 300, 0);
    if (ox || oz) { vx += ox * 0.02 * dt * 10; vz += oz * 0.02 * dt * 10; if (v.driver === 'player' && (A.warn -= dt) <= 0) { A.warn = 8; game.ui.toast('Nothing out there but sea. Turn back.', 'warn'); } }
    v.vel.set(vx, vz); A.vy = vy; A.agl = v.pos.y - gy;
    v.yawRate = dt > 0 ? wrapPi(v.h - h0) / dt : 0;
    v.rpm = damp(v.rpm, clamp(0.12 + A.on * (s.air === 'plane' ? 0.25 + A.thr * 0.6 : 0.62 + Math.abs(ctl.lift || 0) * 0.2), 0.1, 1), 4, dt);
    v.gear = 1; v.reversing = false; v.slip = 0; v.skid = 0;
    // asleep again once it stands with everything stopped
    if (A.grounded && A.on <= 0 && Math.hypot(vx, vz) < 0.05 && v.driver === null && v.health > 0) { v.restT = (v.restT || 0) + dt; if (v.restT > 2) { v.sleep = true; v.vel.set(0, 0); } } else v.restT = 0;
  },
  // the body's attitude and the rotors' turn (render only)
  pose(v, dt) {
    const A = v.air, R = v.rotors;
    v.mesh.position.set(v.pos.x, v.pos.y, v.pos.z);
    v.mesh.rotation.set(-A.pitch, v.h, A.bank);
    if (R) {
      const w = A.on * (v.spec.air === 'plane' ? 34 + A.thr * 60 : 38) * (dt || 0);
      if (R.axis === 'z') R.main.rotation.z += w; else { R.main.rotation.y += w; R.tail.rotation.x += w * 2.2; }
      R.disc.opacity = clamp(A.on * 1.6 - 0.5, 0, 1) * 0.28;
    }
  },
  // can you step out here? (On the ground, or low and slow enough to drop.)
  canExit(v) { return v.air.grounded || (v.air.agl < 3 && v.speed < 9); }
};
