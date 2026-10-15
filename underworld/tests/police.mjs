/* Police pursuit joining (v6): during a live chase, police that are already out there join it when they see
   the player go by — a patrol in traffic turns its siren on and peels off, a staffed cruiser parked at the kerb
   pulls out, an officer on foot reacts, calls it in, chases for a while and walks back (never teleporting into
   a car). Higher wanted levels react faster and from further away. The pursuit is capped (quota + 2), roles
   spread out (chase / intercept / flank), and nothing joins without a chase or without line of sight. */
import { launch, open, check, startNew, finish } from './lib.mjs';
const b = await launch();
const { page, errors } = await open(b);
await startNew(page);
const ev = (f, a) => page.evaluate(f, a);
const step = (sec) => ev(s => { const g = window.game; for (let n = 0; n < s * 60; n++) g.update(1 / 60, 1 / 60); }, sec);

// a patrol car in traffic passing the player during a chase
const setup = await ev(() => {
  const g = window.game, p = g.player;
  g.events.cool = 1e9; g.traffic.update && 0;
  // let traffic populate
  for (let n = 0; n < 240; n++) g.update(1 / 60, 1 / 60);
  return { cars: g.traffic.cars.length };
});
check('traffic is running', setup.cars > 3, JSON.stringify(setup));

const params = await ev(() => { const P = window.game.police, out = []; for (let L = 1; L <= 5; L++) { P.level = L; out.push(P.joinParams()); } P.level = 0; return out; });
check('higher wanted levels react faster and from further away', params.every((p, i) => i === 0 || (p.delay < params[i - 1].delay && p.range >= params[i - 1].range)), JSON.stringify(params));

// no chase, no join: a patrol right next to you ignores you
const idle = await ev(() => {
  const g = window.game, p = g.player, P = g.police;
  const v = g.traffic.cars.find(c => !c.patrol) || g.traffic.cars[0]; v.patrol = true; window.__pat = v;
  p.pos.set(v.pos.x + 6, p.pos.y, v.pos.z); p.vel.set(0, 0, 0);
  for (let n = 0; n < 120; n++) g.update(1 / 60, 1 / 60);
  return { units: P.units.length, level: P.level };
});
check('without a chase a patrol does not react', idle.units === 0 && idle.level === 0, JSON.stringify(idle));

const moving = await ev(() => {
  const g = window.game, p = g.player, P = g.police, v = window.__pat;
  P.spawnT = 999; // no dispatched units, only what is out there
  P.setLevel(3);
  const t0 = performance.now(); let frames = 0, joined = -1;
  for (let n = 0; n < 240; n++) { p.pos.set(v.pos.x + 7, p.pos.y, v.pos.z + 2); g.update(1 / 60, 1 / 60); frames++; if (joined < 0 && P.units.some(u => u.v === v)) joined = frames; }
  void t0;
  const u = P.units.find(x => x.v === v);
  return { joined, siren: !!v.siren, mode: v.mode, pursuing: !!(v.drive && v.drive.target), patrol: v.patrol, joins: P.joins.moving, role: u && u.role };
});
check('a moving patrol that sees the chase joins it (siren on, physics, pursuing)', moving.joined > 0 && moving.siren && moving.mode === 'phys' && moving.pursuing && !moving.patrol, JSON.stringify(moving));
check('at three stars the patrol reacts within about a second, not instantly', moving.joined >= 30 && moving.joined <= 75, JSON.stringify(moving));

// a staffed cruiser parked at the kerb pulls out
const parked = await ev(() => {
  const g = window.game, p = g.player, P = g.police;
  // a fresh chase: the patrol from the last check is sent home and removed
  for (const u of P.units.slice()) { g.vehicles.despawn(u.v); } P.units.length = 0; P.setLevel(3); P.spawnT = 999;
  let x = p.pos.x + 34, z = p.pos.z;
  for (let k = 0; k < 16; k++) { const a = k / 16 * Math.PI * 2, cx = p.pos.x + Math.cos(a) * 34, cz = p.pos.z + Math.sin(a) * 34; if (g.world.grid.lineOfSight(cx, 1.4, cz, p.pos.x, p.pos.y + 1.2, p.pos.z)) { x = cx; z = cz; break; } }
  const v = g.vehicles.spawn('police', x, z, 0, { parked: true, driver: null }); v.staffed = true;
  let joined = -1;
  for (let n = 0; n < 300 && joined < 0; n++) { g.update(1 / 60, 1 / 60); if (P.units.some(u => u.v === v)) joined = n; }
  for (let n = 0; n < 300; n++) g.update(1 / 60, 1 / 60);
  const u = P.units.find(q => q.v === v); return { joined, parked: v.parked, siren: v.siren, driver: v.driver, crewOut: !!(u && u.dismounted), moved: Math.hypot(v.pos.x - x, v.pos.z - z), joins: P.joins.parked };
});
check('a staffed parked cruiser pulls out and joins the pursuit (drives to you; the crew gets out when it arrives)', parked.joined > 0 && !parked.parked && parked.siren && (parked.driver === 'cop' || parked.crewOut) && parked.moved > 3 && parked.joins >= 1, JSON.stringify(parked));
const empty = await ev(() => {
  const g = window.game, p = g.player, P = g.police;
  const v = g.vehicles.spawn('police', p.pos.x - 12, p.pos.z, 0, { parked: true, driver: null }); v.staffed = false;
  for (let n = 0; n < 240; n++) g.update(1 / 60, 1 / 60);
  return { inUnits: P.units.some(u => u.v === v), parked: v.parked };
});
check('an empty parked car (nobody in it) stays parked', !empty.inUnits && empty.parked, JSON.stringify(empty));

// an officer on foot: reacts, chases, gives up when you're well away and walks back (never into a car)
const foot = await ev(() => {
  const g = window.game, p = g.player, P = g.police, out = {};
  const c = g.peds.make('cop', window.__pv.copLook()); c.x = p.pos.x + 10; c.z = p.pos.z + 3; c.y = p.pos.y; c.state = 'free'; c.keep = true; c.brain = window.__pv.copPost; c.postH = 0; c.home = { x: c.x, z: c.z }; c.fireT = 1; g.peds.peds.push(c); P.cops.push(c);
  window.__fc = c;
  let joined = -1;
  for (let n = 0; n < 200 && joined < 0; n++) { g.update(1 / 60, 1 / 60); if (c.brain && c.brain.name === 'copFootChase') joined = n; }
  out.joined = joined; out.calledIn = P.joins.foot;
  // the player runs far away: the officer gives up and walks back to the post
  const hx = c.home.x, hz = c.home.z; let maxJump = 0, px = c.x, pz = c.z;
  p.pos.set(p.pos.x + 140, p.pos.y, p.pos.z);
  for (let n = 0; n < 60 * 25; n++) { g.update(1 / 60, 1 / 60); maxJump = Math.max(maxJump, Math.hypot(c.x - px, c.z - pz)); px = c.x; pz = c.z; }
  out.brain = c.brain && c.brain.name; out.home = Math.hypot(c.x - hx, c.z - hz); out.maxJump = maxJump; out.inCar = P.units.some(u => u.cops.includes(c));
  return out;
});
check('an officer on foot sees the chase, calls it in and gives chase', foot.joined >= 0 && foot.calledIn >= 1, JSON.stringify(foot));
check('…gives up once you are well away and walks back to the post, never teleporting or getting into a car', /copWalkBack|copPost|copStandDown/.test(foot.brain || '') && foot.maxJump < 0.5 && !foot.inCar, JSON.stringify(foot));

// the cap: a dozen patrols around the player never make more than quota + 2 units
const cap = await ev(() => {
  const g = window.game, p = g.player, P = g.police;
  P.setLevel(4); P.spawnT = 0;
  const made = [];
  for (let k = 0; k < 12; k++) { const a = k / 12 * Math.PI * 2; const v = g.vehicles.spawn('police', p.pos.x + Math.cos(a) * 25, p.pos.z + Math.sin(a) * 25, 0, { parked: true, driver: null }); v.staffed = true; made.push(v); }
  let maxLive = 0;
  for (let n = 0; n < 60 * 12; n++) { g.update(1 / 60, 1 / 60); maxLive = Math.max(maxLive, P.units.filter(u => !u.standDown && !u.v.burnt).length); }
  const roles = {}; for (const u of P.units) if (!u.standDown) roles[u.role] = (roles[u.role] || 0) + 1;
  return { maxLive, cap: P.unitCap, roles };
});
check('the pursuit is capped at the level quota + 2 (no twenty-car pile-ups)', cap.maxLive <= cap.cap, JSON.stringify(cap));
check('roles spread out: chasing, intercepting and flanking units', (cap.roles.chase || 0) >= 1 && ((cap.roles.intercept || 0) + (cap.roles.flank || 0)) >= 1, JSON.stringify(cap.roles));
const clear = await ev(() => { const g = window.game, P = g.police; P.clear(); for (let n = 0; n < 60; n++) g.update(1 / 60, 1 / 60); return { level: P.level, sirens: P.units.filter(u => u.v.siren).length }; });
check('when the chase ends every joined unit stands down', clear.level === 0 && clear.sirens === 0, JSON.stringify(clear));
check('no console errors', errors.length === 0, errors.slice(0, 5).join(' | '));
await finish(b, 'police');
