/* =====================================================================
   [CORE+CONTENT] CONTENT: reputation, phone & dialogue, districts, services (garage,
   dealership, repair shop, store, wardrobe), collectibles, secrets,
   achievements, fast travel, police posts and on-screen guidance.
   ===================================================================== */
// list price of every model new (dealer sticker); sale, repair and tuning values all scale from it
const CAR_MSRP = { compact: 1800, sedan: 3200, taxi: 3600, van: 4200, pickup: 6500, suv: 8200, truck: 9500, sports: 19500, muscle: 26000, supercar: 72000,
  classic: 30000, coupe: 46000, offroad: 22000, luxury: 52000, gangcar: 14000, utility: 7000, police: 40000, unmarked: 20000,
  metro: 1500, regent: 2600, crest: 5200, estate: 4600, courier: 3800, apex: 15500, hellion: 34000, revenant: 38000, tempest: 28000, kodiak: 64000, monarch: 88000, valkyr: 120000, obsidian: 150000 };
const carMsrp = type => CAR_MSRP[type] || (VEHICLES[type] && VEHICLES[type].price) || 8000;
// ---- v6 dealerships: three lots with stock you walk up to, inspect and buy where it stands
// used: a rotating cash lot (condition, mileage, bargains); new: Meridian's practical line-up, restocked daily;
// lux: a showroom whose flagship slots rotate every few days
const DEALERSHIPS = {
  used: { place: 'usedlot', name: 'Saltworks Used Autos', short: 'Used Autos', cat: 'carsUsed', every: 2,
    pitch: '“Every car on this lot runs. Most of them run well. Cash today and she’s yours.”',
    pool: [['compact', 10], ['sedan', 10], ['regent', 10], ['metro', 7], ['estate', 6], ['crest', 5], ['van', 6], ['courier', 4], ['pickup', 7], ['suv', 6], ['taxi', 4], ['utility', 4], ['truck', 3], ['gangcar', 2], ['sports', 2], ['classic', 1], ['offroad', 1]],
    rare: ['gangcar', 'sports', 'classic', 'offroad'] },
  new: { place: 'dealer', name: 'Meridian Motors', short: 'New Cars', cat: 'carsNew', every: 1,
    pitch: '“Everything on the lot is new, road-legal and yours the moment the cash clears. Drive it off the lot.”',
    line: ['metro', 'compact', 'apex', 'sedan', 'estate', 'crest', 'suv', 'pickup', 'van', 'courier', 'utility', 'truck', 'sports', 'sedan', 'crest'] },
  lux: { place: 'prestige', name: 'Valen Prestige Motors', short: 'Performance & Luxury', cat: 'carsLux', every: 4,
    pitch: '“Take your time. Every car here is the only one of its kind on the island this week.”',
    flagship: ['supercar', 'coupe', 'valkyr', 'obsidian', 'classic', 'revenant'], core: ['sports', 'muscle', 'hellion', 'tempest', 'luxury', 'kodiak', 'monarch'] }
};
// Rep each model needs at a licensed dealer (the used lot sells to anyone with cash). Reputation is a number
// (§1); there is no named ladder.
const CAR_REP = { metro: 0, compact: 0, sedan: 150, estate: 150, crest: 150, courier: 150, van: 150, utility: 150, apex: 400, pickup: 400, suv: 400, truck: 400, sports: 800, tempest: 800, luxury: 800,
  muscle: 1300, hellion: 1300, kodiak: 1300, monarch: 1300, classic: 1300, revenant: 1300, coupe: 2000, supercar: 2000, valkyr: 2000, obsidian: 2000 };
const CAR_CLASS = { metro: 'City car', compact: 'Hatchback', apex: 'Hot hatch', sedan: 'Sedan', regent: 'Sedan', estate: 'Estate', crest: 'Crossover', suv: 'SUV', kodiak: 'Performance SUV',
  pickup: 'Pickup', utility: 'Work truck', truck: 'Box truck', van: 'Van', courier: 'Panel van', taxi: 'Ex-taxi', sports: 'Sports car', tempest: 'Lightweight sports car',
  muscle: 'Muscle car', hellion: 'Modern muscle', gangcar: 'Lowrider', classic: 'Classic muscle', revenant: 'Classic fastback', coupe: 'Grand tourer', monarch: 'Luxury GT',
  luxury: 'Luxury sedan', supercar: 'Supercar', valkyr: 'Mid-engine exotic', obsidian: 'Luxury supercar', offroad: 'Off-roader', police: 'Ex-police', unmarked: 'Ex-police' };
const condLabel = c => c >= 90 ? ['Excellent', '#7fe08f'] : c >= 75 ? ['Good', '#c8e07f'] : c >= 62 ? ['Fair', '#ffd84d'] : ['Rough', '#ff8a3d'];
const TUNE = [
  { id: 'engine', name: 'Engine', desc: 'More power and a higher top speed.', prices: [1500, 3500, 7000] },
  { id: 'brakes', name: 'Brakes', desc: 'Shorter stops, later braking.', prices: [900, 2000, 4200] },
  { id: 'grip', name: 'Tyres & suspension', desc: 'More grip in every corner.', prices: [1200, 2800, 5600] },
  { id: 'armor', name: 'Reinforced body', desc: 'Takes less damage from crashes.', prices: [1000, 2400, 5000] }
];
// Rep a tuning stage needs (stage 1, 2, 3)
const TUNE_REP = [0, 800, 1300];
// resale (§45.24). An ordinary car you bought carries its provenance: the Dirty Cash and Clean Bank you put into it
// (the purchase and any tuning, e.prov). Its sale pays each currency in proportion, and never more than RESALE_CAP
// of what you put in, so flipping cars always loses money and can't launder. A stolen car sells for Dirty Cash
// through criminal channels. Found, reward and mission cars were never paid for: they follow their own explicit
// rule here (Clean, as before), to be revisited with vehicle ownership in Session 5.
const RESALE_CAP = 0.85;
const CAR_RESALE = { bought: { k: 0.5 }, stolen: { k: 0.22, cur: 'dirty' }, found: { k: 0.35, cur: 'clean' }, reward: { k: 0.35, cur: 'clean' }, mission: { k: 0.35, cur: 'clean' } };
const STORE_ITEMS = [
// pay: how each is paid (MONEY_SOURCES): food and first aid with cash or the bank, shop goods from the bank,
// scratch cards (a lottery) from the bank only, at the card counter (§45.5, §45.18)
  { id: 'snack', name: 'Hot Roll & Coffee', desc: 'Restores 120 health.', price: 12, pay: 'food' },
  { id: 'medkit', name: 'First-Aid Kit', desc: 'Patches you up on the spot: restores 180 health.', price: 90, pay: 'food' },
  { id: 'drink', name: 'Volt Energy', desc: 'Unlimited sprint for a minute.', price: 25, pay: 'food' },
  { id: 'vest', name: 'Kevlar Vest', desc: 'A 150-point armour layer that soaks 75% of every hit until it is spent.', price: 450, rep: 400, pay: 'shop' },
  { id: 'scratch', name: 'Scratch Cards', desc: 'Five cards from $5 to $100. Top prize $1,000,000. Most lose. Bank only.', price: 5, pay: 'casinoStake' },
  { id: 'map', name: 'Collector’s Map', desc: 'Someone marked five hidden packages on a tourist map.', price: 1200, pay: 'shop' }
];
const ORIGIN_CHIP = { bought: ['OWNED', '#7fe08f'], stolen: ['STOLEN', '#ff4d5e'], reward: ['SPECIAL', '#d28cff'], found: ['FOUND', '#46d4c4'] };
const ACHIEVEMENTS = [
  { id: 'day_one', name: 'Day One', desc: 'Finish your first job for Rosa.' },
  { id: 'tourist', name: 'Tourist', desc: 'Discover every district.' },
  { id: 'regular', name: 'Regular', desc: 'Discover every service in the city.' },
  { id: 'pack10', name: 'Finders Keepers', desc: 'Find 10 hidden packages.' },
  { id: 'pack30', name: 'Smuggler’s Map', desc: 'Find all 30 hidden packages.' },
  { id: 'jump5', name: 'Airtime', desc: 'Complete 5 unique stunt jumps.' },
  { id: 'jumpall', name: 'Gravity Optional', desc: 'Complete every unique stunt jump.' },
  { id: 'race1', name: 'Green Light', desc: 'Win a street race.' },
  { id: 'raceall', name: 'King of the Streets', desc: 'Win every street race.' },
  { id: 'escape4', name: 'Ghost', desc: 'Escape a 4-star manhunt.' },
  { id: 'near50', name: 'Threading the Needle', desc: 'Pull off 50 near misses.' },
  { id: 'drift', name: 'Sideways', desc: 'Score 2,000 in a single drift.' },
  { id: 'fleet', name: 'Fleet Owner', desc: 'Own six vehicles at once.' },
  { id: 'home', name: 'Moving Up', desc: 'Buy the Valen Tower penthouse.' },
  { id: 'samaritan', name: 'Good Samaritan', desc: 'Help out at 5 street events.' },
  { id: 'secrets4', name: 'Keeper of Secrets', desc: 'Find 4 of the city’s secrets.' },
  { id: 'tuned', name: 'Fully Loaded', desc: 'Max every tuning slot on one car.' },
  { id: 'legend', name: 'Port Valen Legend', desc: 'Finish the story.' }
];
const SECRETS = [
  { id: 'rooftop', name: 'Rooftop Zephyr', cash: 1500 },
  { id: 'kickoff', name: 'Midnight Kickoff', cash: 1000 },
  { id: 'well', name: 'Wishing Well', cash: 77 },
  { id: 'bullet', name: 'Boulevard Bullet', cash: 1200 },
  { id: 'ghostferry', name: 'The Ghost Ferry', cash: 2000 },
  { id: 'owl', name: 'Night Owl', cash: 444 },
  { id: 'gold', name: 'The Golden Corsair', cash: 0 },
  { id: 'pitch', name: 'Pitch Invader', cash: 800 }
];
const SERVICE_PLACES = ['motorworks', 'dealer', 'store', 'police', 'tower'];
const POSTS = [
  { place: 'police', dx: -3.2, dz: -1.5 }, { place: 'police', dx: 3.4, dz: -1.2 },
  { place: 'mall', dx: -7, dz: 1.5 }, { place: 'tower', dx: 6.5, dz: 2.5 }, { place: 'stadium', dx: -9, dz: 1.2 }
];
const CONTACT_AVATAR = { radio: '#4d8dff', rosa: '#46d4c4', tull: '#ff8a3d', ines: '#d28cff', ferry: '#ffd84d', dex: '#4d8dff', moss: '#7fb2ff', pv: '#e8eef6', unknown: '#8a8f96', vance: '#ff4d5e' };
const CONTACT_NAMES = { radio: 'Police radio', rosa: 'Rosa Calder', tull: '"Sprocket" Tull', ines: 'Ines Varga', ferry: 'The Ferryman', dex: 'Dex Okafor', moss: 'Sgt. Lena Moss', pv: 'Valen Courier', unknown: 'Unknown number', vance: 'Vance' };

function copPost(c, dt) {
  const g = game, pol = g.police;
  if (c.state === 'down' || c.state === 'ko') return;
  c.state = 'free'; c.vx = damp(c.vx, 0, 6, dt); c.vz = damp(c.vz, 0, 6, dt);
  c.h = dampAngle(c.h, c.postH + Math.sin(g.time * 0.3 + c.id) * 0.6, 2, dt);
  c.pose.hold = null; c.pose.aim = 0;
  // (joining a pursuit is the police manager's job: line of sight and a reaction time, see joinScan)
  void pol;
}

class ContentManager {
  constructor(game) {
    const g = this.g = game;
    this.interiors = new InteriorManager(g);
    this.phoneQ = []; this.phoneT = 0; this.subQ = []; this.subT = 0;
    this.checkT = 0; this.discT = 0; this.postT = 0; this.secretT = 0;
    this.waypoint = null; this.guideTarget = null; this.posts = POSTS.map(p => ({ ...p, ped: null }));
    this.pitchT = 0; this.goldCar = null;
    this._buildPackages();
    this._bindUI();
  }
  // ------------------------------------------------------------ reputation (a number: who knows you, §1)
  addRep(n, why) {
    if (!(n > 0)) return;
    this.g.save.rep += Math.round(n);
    if (why) this.g.ui.toast(`+${Math.round(n)} REP · ${why}`, 'money');
  }
  // ------------------------------------------------------------ phone + subtitles
  phone(from, text, opts = {}) {
    const s = this.g.save;
    s.messages.push({ from, text, t: Math.floor(s.stats.playTime), day: this.g.env ? this.g.env.timeString() : '' });
    if (s.messages.length > 60) s.messages.splice(0, s.messages.length - 60);
    if (!opts.silent) this.phoneQ.push({ from, text });
  }
  say(who, text, dur) { this.subQ.push({ who, text, dur: dur || clamp(2.2 + text.length * 0.045, 2.5, 7) }); }
  clearSubs() { this.subQ.length = 0; this.subT = 0; $('subtitle').classList.add('hidden'); }
  _updateComms(rdt) {
    this.phoneT -= rdt;
    if (this.phoneT <= 0 && this.phoneQ.length) {
      const m = this.phoneQ.shift(), el = $('phone');
      el.querySelector('.pa').style.background = CONTACT_AVATAR[m.from] || '#8a8f96';
      el.querySelector('.pa').textContent = (CONTACT_NAMES[m.from] || m.from).replace(/[^A-Za-z]/g, '').charAt(0);
      el.querySelector('b').textContent = CONTACT_NAMES[m.from] || m.from;
      el.querySelector('span').textContent = m.text;
      el.classList.remove('hidden', 'out'); void el.offsetWidth;
      this.phoneT = clamp(3.5 + m.text.length * 0.04, 4, 9);
      this.g.audio.play('phone');
      clearTimeout(this._pt); this._pt = setTimeout(() => el.classList.add('out'), (this.phoneT - 0.5) * 1000);
    } else if (this.phoneT < -0.6 && !this.phoneQ.length) $('phone').classList.add('hidden');
    this.subT -= rdt;
    if (this.subT <= 0) {
      const el = $('subtitle');
      if (this.subQ.length) {
        const s = this.subQ.shift();
        el.innerHTML = '';
        const b = document.createElement('b'); b.textContent = (CONTACT_NAMES[s.who] || s.who) + ': '; b.style.color = CONTACT_AVATAR[s.who] || '#ffb547';
        el.appendChild(b); el.appendChild(document.createTextNode(s.text));
        el.classList.remove('hidden'); this.subT = s.dur;
      } else el.classList.add('hidden');
    }
  }
  // ------------------------------------------------------------ achievements & secrets
  ach(id) {
    const s = this.g.save; if (s.achievements[id]) return;
    const a = ACHIEVEMENTS.find(x => x.id === id); if (!a) return;
    s.achievements[id] = Math.floor(s.stats.playTime) + 1;
    const el = $('ach'); el.querySelector('b').textContent = a.name; el.querySelector('span').textContent = a.desc;
    el.classList.remove('hidden', 'out'); void el.offsetWidth;
    this.g.audio.play('ach');
    clearTimeout(this._at); this._at = setTimeout(() => { el.classList.add('out'); setTimeout(() => el.classList.add('hidden'), 500); }, 4200);
    this.g.saveGame();
  }
  secret(id) {
    const s = this.g.save; if (s.secrets[id]) return;
    const d = SECRETS.find(x => x.id === id); if (!d) return;
    s.secrets[id] = 1;
    this.g.ui.banner('Secret Found', d.name + (d.cash ? ' · ' + fmtMoney(d.cash) : ''), 'info', 3.5);
    if (d.cash) this.g.earn(d.cash, 'secret');
    this.addRep(25);
    this.g.audio.play('pass');
    if (Object.keys(s.secrets).length >= 4) this.ach('secrets4');
    this.g.saveGame();
  }
  _checkSecrets() {
    const g = this.g, p = g.player, t = g.env.time, pl = g.world.places;
    const foot = p.state === 'foot' && !p.interior, pv = p.state === 'vehicle' ? p.vehicle : null;
    if (foot && t < 1 && Math.hypot(p.pos.x - pl.stadium.center.x, p.pos.z - pl.stadium.center.z) < 4) this.secret('kickoff');
    if (foot) { const tb = g.world.block(6, 5); if (Math.hypot(p.pos.x - tb.cx, p.pos.z - (tb.z1 - 6)) < 3.4 && p.pos.y < CURB_H + 1.2) this.secret('well'); }
    if (pv && pv.speed > 58 && Math.abs(p.pos.z - BLVD * P) < 8) this.secret('bullet');
    const fm = g.missions.contacts.find(c => c.id === 'ferry');
    if (fm && g.env.fog > 0.5 && t >= 3 && t < 5 && Math.hypot(p.pos.x - fm.x, p.pos.z - fm.z) < 10) this.secret('ghostferry');
    if (foot && p.pos.y > CURB_H + 9 && t >= 4.5 && t < 5.25 && Math.hypot(p.pos.x - pl.garageRoof.roof.x, p.pos.z - pl.garageRoof.roof.z) < 30) this.secret('owl');
  }
  // ------------------------------------------------------------ hidden packages
  _buildPackages() {
    const g = this.g, w = g.world;
    // make sure every package can be reached: nudge it out of any collider it was dropped into
    const res = {};
    for (const pk of w.packages) {
      for (let k = 0; k < 10; k++) {
        const r = w.grid.resolveCircle(pk.x, pk.z, 0.7, pk.y + 0.2, pk.y + 1.4, res);
        if (!r.hit) break;
        pk.x = r.x; pk.z = r.z;
      }
      pk.y = Math.max(pk.y, groundY(pk.x, pk.z));
    }
    const mat = new THREE.MeshStandardMaterial({ color: 0x2ecc71, emissive: 0x1fa055, emissiveIntensity: 1.6, roughness: 0.35, metalness: 0.1 });
    this.pkMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(0.46, 0.46, 0.46), mat, 30);
    this.pkMesh.count = 0; this.pkMesh.frustumCulled = false; this.pkMesh.castShadow = true;
    const halo = new THREE.MeshBasicMaterial({ map: makeRadialTexture('rgba(120,255,160,0.9)', 'rgba(120,255,160,0)', 64), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
    this.pkHalo = new THREE.InstancedMesh(new THREE.PlaneGeometry(2.2, 2.2).rotateX(-Math.PI / 2), halo, 30);
    this.pkHalo.count = 0; this.pkHalo.frustumCulled = false;
    g.scene.add(this.pkMesh, this.pkHalo);
    this.pkNear = []; this._m = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._e = new THREE.Euler(); this._s = new THREE.Vector3(1, 1, 1); this._v = new THREE.Vector3();
  }
  _updatePackages(dt) {
    const g = this.g, p = g.player, s = g.save;
    this.discT -= dt;
    if (this.discT <= 0) {
      this.discT = 0.3;
      this.pkNear = g.world.packages.filter(pk => !s.packages[pk.id] && dist2(pk.x, pk.z, p.pos.x, p.pos.z) < 95 * 95);
    }
    let n = 0;
    for (const pk of this.pkNear) {
      if (s.packages[pk.id]) continue;
      const bob = Math.sin(g.time * 2.4 + pk.id) * 0.12;
      this._e.set(0.4, g.time * 1.6 + pk.id, 0.2); this._q.setFromEuler(this._e);
      this._v.set(pk.x, pk.y + 0.75 + bob, pk.z); this._m.compose(this._v, this._q, this._s);
      this.pkMesh.setMatrixAt(n, this._m);
      this._m.makeTranslation(pk.x, pk.y + 0.04, pk.z); this.pkHalo.setMatrixAt(n, this._m);
      n++;
      // pick-up
      if (p.interior || g.state !== 'playing') continue;
      const pv = p.state === 'vehicle' ? p.vehicle : null;
      const dy = Math.abs(p.pos.y - pk.y);
      if (dist2(p.pos.x, p.pos.z, pk.x, pk.z) < (pv ? 2.8 * 2.8 : 1.4 * 1.4) && dy < 2.2) this.collectPackage(pk);
    }
    this.pkMesh.count = n; this.pkHalo.count = n;
    this.pkMesh.instanceMatrix.needsUpdate = true; this.pkHalo.instanceMatrix.needsUpdate = true;
  }
  collectPackage(pk) {
    const g = this.g, s = g.save;
    if (s.packages[pk.id]) return;
    s.packages[pk.id] = 1; delete s.hints[pk.id];
    const n = Object.keys(s.packages).length; s.stats.packagesFound = n;
    g.earn(250, 'package'); this.addRep(10);
    g.audio.play('pickup'); g.fx.flashLight(pk.x, pk.y + 1, pk.z, 6, 0.4, 0x7fe08f);
    g.ui.banner('Hidden Package', `${n} of 30 · $250`, 'info', 2.2);
    if (n === 10) { g.earn(2500, 'package'); s.ammo.pistol += 48; this.phone('unknown', 'Ten already? Keep looking. There’s a pistol crate on its way to your safehouse.'); s.weapons.pistol = true; this.ach('pack10'); }
    if (n === 15) { this.phone('unknown', 'You like finding things. Harbor Row, the alley behind the depot — someone left something golden there.'); s.flags.goldHint = true; }
    if (n === 20) { g.earn(5000, 'package'); s.weapons.smg = true; s.ammo.smg += 120; this.phone('unknown', 'Twenty. An SMG is waiting in your stash. Don’t make me regret it.'); }
    if (n === 30) { g.earn(15000, 'package'); this.ach('pack30'); this.phone('unknown', 'All thirty. You know this island better than I do now.'); }
    g.saveGame();
  }
  _spawnGold() {
    const g = this.g, s = g.save;
    if (!s.flags.goldHint || s.secrets.gold || (this.goldCar && g.vehicles.list.includes(this.goldCar))) return;
    const sp = curbAt(11, 8, 2, 62);
    if (dist2(sp.x, sp.z, g.player.pos.x, g.player.pos.z) > 160 * 160 || dist2(sp.x, sp.z, g.player.pos.x, g.player.pos.z) < 30 * 30) return;
    const v = g.vehicles.spawn('classic', sp.x, sp.z, sp.h, { parked: true, color: 0xc9a227 });
    v.touched = true; v.goldCar = true; v.special = true; this.goldCar = v;
  }
  // ------------------------------------------------------------ garage v2
  get garageCap() { return this.g.uw ? this.g.uw.props.garageCap() : 0; }
  // a new car in your fleet: it takes a free bay (at, or the first free one). No bay, no car: there is no storage
  // beyond your real parking (§14, §45.29). Returns null when there is nowhere to put it.
  addToGarage(type, origin, color, quiet, at) {
    const s = this.g.save, PM = this.g.uw && this.g.uw.props;
    // the fleet never outgrows the parking (a car from an old save still waiting for a space counts)
    if (PM && s.garage.length >= this.garageCap) { if (!quiet) this.g.ui.toast('No free parking space.', 'warn'); return null; }
    if (!at && PM) for (const def of PM.ownedList()) { const b = PM.freeBay(def); if (b) { at = { p: def.id, i: b.i }; break; } }
    if (!at) { if (!quiet) this.g.ui.toast('No free parking space.', 'warn'); return null; }
    const e = { uid: s.nextUid++, type, color: color !== undefined ? color : VEHICLES[type].colors[0], origin, dmg: 0, tune: { engine: 0, brakes: 0, grip: 0, armor: 0 }, at, out: false, loc: null };
    s.garage.push(e);
    if (!quiet) this.g.ui.toast(`${VEHICLES[type].name} added to your garage.`, 'money');
    if (s.garage.length >= 6) this.ach('fleet');
    this.g.autosave('Vehicle acquired');
    return e;
  }
  garagePoints() { return this.g.uw ? this.g.uw.props.garagePoints() : []; }
  nearGarage(x, z, r = 4) { for (const gp of this.garagePoints()) if (Math.hypot(x - gp.p.x, z - gp.p.z) < r) return gp; return null; }
  storeVehicle(v, gp) {
    const g = this.g, s = g.save, PM = g.uw.props;
    if (v.mission && !(g.campaign && g.campaign.canStore(v))) { g.ui.toast('This vehicle is needed for the job.', 'warn'); g.audio.play('deny'); return false; }
    if (v.type === 'police' || v.type === 'unmarked' && !v.garageUid) { g.ui.toast('Too hot to keep — every cop in the city knows this car.', 'warn'); g.audio.play('deny'); return false; }
    if (g.police.level > 0) { g.ui.toast('Lose the police before you open the garage.', 'warn'); g.audio.play('deny'); return false; }
    const def = gp.def || PROP_BY_ID[gp.id];
    let e = v.garageUid ? s.garage.find(x => x.uid === v.garageUid) : null;
    // a bay: the one asked for, the car's own bay at this property, or the first free one
    let bay = gp.bay || null;
    if (!bay && e && e.at && e.at.p === def.id) bay = PM.bays(def)[e.at.i];
    if (!bay) bay = PM.freeBay(def);
    const occupant = bay && PM.carAt(def.id, bay.i);
    if (!bay || (occupant && occupant !== e)) { g.ui.toast(`No free space at ${def.name} (${PM.capOf(def)} in all). Park somewhere else or sell a car.`, 'warn'); g.audio.play('deny'); return false; }
    if (!e) {
      const origin = v.goldCar ? 'found' : v.rareFind ? 'found' : v.origin || (v.owned ? 'bought' : 'stolen');
      e = this.addToGarage(v.type, origin, v.colorHex, true, { p: def.id, i: bay.i });
      if (!e) { g.ui.toast('No free parking space.', 'warn'); g.audio.play('deny'); return false; }
      // a stolen car parked in your space is still stolen: HOT until the Chop Shop cleans it (§45.30)
      e.hot = g.vreg.isHot(v) || origin === 'stolen'; if (v.trackId) { const r = g.vreg.rec(v.trackId); if (r && r.tune) e.tune = { ...r.tune }; }
      Money.adoptCar(v, e.uid); // cash left in the car is now kept with it in your garage
      e.vtier = v.vtier || VEHICLES[v.type].tier;
      g.ui.toast(`${v.spec.name} parked at ${def.name}.${e.hot ? ' It is still HOT: the Chop Shop can clean its papers.' : ''}`, 'money');
      if (v.rareFind) this.secret('rooftop');
    } else { e.at = { p: def.id, i: bay.i }; g.ui.toast(`${v.spec.name} parked at ${def.name} · ${PARK_LABEL[bay.kind] || 'space'} ${bay.i + 1}.`, 'money'); }
    e.out = false; e.loc = null; e.dmg = clamp(100 - v.health, 0, 100); e.color = v.colorHex;
    // one trunk, one place: the garage entry and the live car share the same goods object
    if (!v.trunk) v.trunk = e.trunk || {};
    e.trunk = v.trunk;
    // the car stays where you left it: snapped neatly into the bay, as one of your stored cars
    v.pos.set(bay.x, groundY(bay.x, bay.z, bay.y === undefined ? v.pos.y : bay.y), bay.z); v.h = bay.h; v.vel.set(0, 0); v.yawRate = 0;
    g.exitVehicle(true);
    v.owned = true; v.touched = true; v.garageUid = e.uid; v.display = true; v.parked = true; v.sleep = true; v.mission = null;
    v.syncMesh(0);
    // a tracked car (stolen, found) joins your fleet: one record for it from now on, its cash with it
    if (g.vreg) { g.vreg.forget(v, 'owned'); g.vreg.cars.set(e.uid, v); }
    g.audio.play('door');
    g.autosave('Vehicle stored'); g.saveGame();
    if (g.campaign) g.campaign.onStored(e, gp);
    return true;
  }
  // where is it: a fleet car stands in its bay or where you left it; the way there goes on the map (there is no
  // moving it anywhere but by driving it)
  takeOut(uid) {
    const g = this.g, s = g.save, e = s.garage.find(x => x.uid === uid);
    if (!e) return;
    const w = g.vreg.where(e); if (!w) { g.ui.toast('It has no space of its own yet.', 'warn'); return; }
    g.ui.toast(`${VEHICLES[e.type].name}: ${w.name}${e.dmg >= 100 ? ' (wrecked: repair it first)' : ''}.`, 'money');
    if (Math.hypot(w.x - g.player.pos.x, w.z - g.player.pos.z) > 40) this.setWaypoint(w.x, w.z, VEHICLES[e.type].name);
    g.audio.play('confirm');
  }
  onVehicleGone(v) {
    // owned cars that burn are not lost: they come back wrecked and need a repair; a tracked car's loss is logged
    const g = this.g;
    if (v.garageUid) { const e = g.save.garage.find(x => x.uid === v.garageUid); if (e) { const lost = g.vreg.wrecked(e, v); g.ui.toast(`Your ${v.spec.name} was wrecked. Your people will tow it home: it needs a repair.${lost ? ` The cargo burned: ${lost}.` : ''}`, 'warn'); } }
    else if (v.trackId) { const lost = g.vreg.burned(v); if (lost) g.ui.toast(`The cargo burned with the ${v.spec.name}: ${lost}.`, 'warn'); }
    else if (v.trunk && units(v.trunk) && v === g.player.lastVehicle) { g.ui.toast(`The cargo burned with the ${v.spec.name}: ${goodsList(v.trunk)}.`, 'warn'); Inv.clear(v.trunk); }
  }
  // ------------------------------------------------------------ service screens
  _bindUI() {
    const body = $('svcBody');
    body.addEventListener('click', e => {
      const b = e.target.closest('[data-act]'); if (!b || b.disabled) return;
      this.g.audio.play('ui');
      if (this._svcAct) this._svcAct(b.dataset.act);
    });
    body.addEventListener('change', e => { const s = e.target.closest('select[data-sel]'); if (s && this._svcAct) this._svcAct(s.dataset.sel + ':' + s.value); });
  }
  openSvc(title, hint, render, act) {
    if (this._svcClose) { const f = this._svcClose; this._svcClose = null; f(); }
    $('svcTitle').textContent = title; $('svcHint').textContent = hint;
    this._svcRender = render; this._svcAct = act;
    $('svcBody').innerHTML = render();
    if (this.g.ui.modal !== 'svcScreen') this.g.ui.open('svc');
    if (document.pointerLockElement) document.exitPointerLock();
  }
  refreshSvc(hint) { if (hint !== undefined) $('svcHint').textContent = hint; if (this._svcRender) $('svcBody').innerHTML = this._svcRender(); }
  _bars(type, tune) {
    const v = VEHICLES[type], t = tune || { engine: 0, grip: 0 };
    const bar = (val, max, extra) => `<div class="bar"><i style="width:${clamp(val / max, 0.05, 1) * 100}%"></i>${extra ? `<i class="up" style="width:${clamp(extra / max, 0, 1) * 100}%"></i>` : ''}</div>`;
    return `<div class="stat"><span>Top speed</span><span>${Math.round(v.vmax * (1 + t.engine * 0.035) * 3.6)} km/h</span></div>${bar(v.vmax * (1 + t.engine * 0.035), 90)}
      <div class="stat"><span>Acceleration</span></div>${bar(v.power * (1 + t.engine * 0.09) / v.mass, 15)}
      <div class="stat"><span>Grip</span></div>${bar(v.grip * (1 + t.grip * 0.06), 1.5)}`;
  }
  chip(origin) { const c = ORIGIN_CHIP[origin] || ORIGIN_CHIP.bought; return `<span class="chip" style="--c:${c[1]}">${c[0]}</span>`; }
  openGarage(gp) {
    const g = this.g, s = g.save, PM = g.uw.props;
    gp = gp || this.garagePoints()[0];
    if (!gp) { this.deny('You don’t own anywhere to park yet.'); return; }
    const def = gp.def || PROP_BY_ID[gp.id];
    const card = (e, here) => {
      const v = VEHICLES[e.type], wrecked = e.dmg >= 100, rcost = this.repairCost(e.type, 100 - e.dmg) * 1.4 | 0;
      const tuneLv = TUNE.map(t => e.tune[t.id]).reduce((a, b) => a + b, 0);
      // its home space, and where it actually is (the street, if that's where you left it)
      const home = e.at && PROP_BY_ID[e.at.p] ? `${PROP_BY_ID[e.at.p].name} · ${PARK_LABEL[PM.bays(PROP_BY_ID[e.at.p])[e.at.i].kind] || 'space'} ${e.at.i + 1}` : 'No space of its own: buy more parking';
      const w = g.vreg.where(e), loc = e.imp ? `In the ${IMPOUND.name} (space ${e.imp.slot + 1}) · release ${fmtMoney(e.imp.fee)}${e.imp.paid ? ' paid: drive it out' : ' at the window'} · its space: ${home}` : e.out && w ? `Parked on ${w.name} · its space: ${home}` : home;
      return `<div class="card"${e.vtier === 'rare' ? ' style="box-shadow:0 0 0 1px #d28cff inset"' : ''}><div class="t">${v.name} ${tierChip(e.vtier || v.tier)} ${this.chip(e.origin)}${e.hot ? ' <span class="chip" style="--c:#ff4d5e">HOT</span>' : ''}${e.imp ? ' <span class="chip" style="--c:#ffb547">IMPOUNDED</span>' : ''}</div><div class="d">${esc(loc)}</div>${this._bars(e.type, e.tune)}
        <div class="stat"><span>Condition</span><span style="color:${e.dmg > 60 ? 'var(--red)' : 'inherit'}">${100 - e.dmg}%</span></div>
        <div class="stat"><span>Tuning</span><span>${tuneLv ? tuneLv + ' / 12' : 'stock'}</span></div>
        <div class="stat"><span>Cargo</span><span>${fmtLb(cargoC(e.trunk))} of ${fmtLb(cargoCapC(e.type))}</span></div>
        <div class="btns"><button class="sbtn${here && !e.out ? ' gold' : ''}" data-act="out:${e.uid}">${wrecked ? 'Wrecked · where is it?' : 'Where is it?'}</button>
        ${e.dmg > 0 ? `<button class="sbtn" data-act="fix:${e.uid}" ${!Money.can(rcost, 'garage') ? 'disabled' : ''}>Repair ${fmtMoney(rcost)}</button>` : ''}
        <button class="sbtn" data-act="sell:${e.uid}">Sell ${fmtMoney(this.sellPrice(e))}</button></div></div>`;
    };
    const render = () => {
      const here = s.garage.filter(e => e.at && e.at.p === def.id), other = s.garage.filter(e => !(e.at && e.at.p === def.id));
      const col = this.collection(), rank = ['beater', 'common', 'nice', 'sport', 'luxury', 'rare'];
      here.sort((a, b) => rank.indexOf(b.vtier) - rank.indexOf(a.vtier));
      return `<div class="svcTop"><span>Here <b>${here.length} / ${PM.capOf(def)}</b> · ${esc(PM.parkingText(def))}</span><span>All your cars <b>${s.garage.length} / ${this.garageCap}</b></span><span>${Money.html('garage')}</span></div>
        <div class="card"><div class="t">${def.id === 'mansion' ? 'The Crestmoor collection' : 'Your collection'}</div><div class="d">${col.models} of ${col.of} models · rare finds ${col.rareModels} of ${col.rareOf} (${col.rare} car${col.rare === 1 ? '' : 's'}) · worth ${fmtMoney(col.value)}</div><div class="d">${rank.filter(t => col.byTier[t]).map(t => `${tierChip(t)} ${col.byTier[t]}`).join(' ') || 'No cars yet.'}</div><div class="d" style="font-size:11px">Rare models (Aurel RS, Corsair 68, Zephyr, Mesa Trail) turn up parked in Crestmoor, the Financial District and on the Strip.</div></div>
        <div class="grid2">${here.map(e => card(e, true)).join('') || '<div class="hint">Nothing parked here. Drive a car into a free space and stop to park it.</div>'}</div>
        ${other.length ? `<h3>Elsewhere</h3><div class="grid2">${other.map(e => card(e, false)).join('')}</div>` : ''}
        ${(s.pendingCars || []).length ? `<h3>Waiting for a space</h3><div class="jobs">${s.pendingCars.map((P, i) => `<div class="job"><i>⏳</i><div><b>${esc(VEHICLES[P.type].name)}</b><span>${P.from ? 'With ' + esc(P.from) + ': ' : ''}yours when you have a free space</span></div><button class="sbtn" data-act="collect:${i}" ${g.vreg.freeBays() > 0 ? '' : 'disabled'}>Collect</button></div>`).join('')}</div>` : ''}`;
    };
    this.openSvc(def.name, 'Each car has its own space, kept for it even while it is out. Drive into a free space and stop to park. A car you leave around town stays where you left it.', render, act => {
      const [k, id] = act.split(':'), uid = +id;
      if (k === 'collect') { const r = g.vreg.collect(uid); this.refreshSvc(r || 'Collected: it is in its space.'); return; }
      const e = s.garage.find(x => x.uid === uid); if (!e) return;
      if (k === 'out') { this.takeOut(uid); g.ui.back(); return; }
      if (k === 'fix') { const c = this.repairCost(e.type, 100 - e.dmg) * 1.4 | 0; if (!Money.pay(c, 'garage')) return; e.dmg = 0; s.stats.repairs++; g.audio.play('cash'); const dv = g.vreg.live(e); if (dv) { dv.health = 100; dv.burnt = false; } }
      if (k === 'sell') {
        const left = e.trunk && units(e.trunk) && g.uw ? g.uw.unloadLeftover(e) : '';
        if (left) { this.refreshSvc(`Empty the trunk first: ${left} would not fit in the stash or your pockets.`); return; }
        const sale = this.saleOf(e);
        g.ui.ask(`Sell the ${VEHICLES[e.type].name}?`, `You'll get ${fmtMoney(sale.total)}${e.origin === 'stolen' ? ' in cash: it’s stolen, so nobody legit will pay you for it' : sale.dirty && sale.clean ? `: ${fmtMoney(sale.clean)} into your bank and ${fmtMoney(sale.dirty)} in cash, as you paid for it` : sale.dirty ? ' in cash: you paid for it in cash' : ' into your bank'}. ${e.origin === 'reward' || e.origin === 'found' ? 'Special cars can’t be bought back.' : ''}`, 'Sell', () => {
          const i = s.garage.indexOf(e); if (i < 0) return;
          for (const v of g.vehicles.list.slice()) if (v.garageUid === e.uid && v !== g.player.vehicle) g.vehicles.despawn(v);
          g.vreg.cars.delete(e.uid);
          if (e.trunk && units(e.trunk) && g.uw) { const r = g.uw.unloadTrunk(e); if (r) g.ui.toast(r, 'money'); }
          Money.emptyCar(e.uid); // cash kept in its trunk comes out with you
          // a stolen car sells for Dirty Cash (§45.22); a bought one pays back in the money it was bought with (§45.24)
          s.garage.splice(i, 1);
          if (e.origin === 'stolen') Money.earn(sale.total, 'stolenCarSale');
          else { if (sale.clean) Money.earn(sale.clean, 'carSale'); if (sale.dirty) Money.earn(sale.dirty, 'dirtyCarSale'); }
          g.audio.play('cash'); g.saveGame(); this.refreshSvc();
        });
        return;
      }
      g.saveGame(); this.refreshSvc();
    });
  }
  sellPrice(e) { return this.saleOf(e).total; }
  // what a garage car sells for and in which currency: { total, dirty, clean }
  saleOf(e) {
    const R = CAR_RESALE[e.origin] || CAR_RESALE.bought;
    const tuneV = TUNE.reduce((a, t) => a + t.prices.slice(0, e.tune[t.id]).reduce((x, y) => x + y, 0), 0);
    const tv = (TIER_LOOK[e.vtier] || TIER_LOOK.common).value;
    let total = (carMsrp(e.type) * R.k * tv + tuneV * 0.3) * (1 - e.dmg / 200);
    if (R.cur) { total = Math.round(total / 10) * 10; return R.cur === 'dirty' ? { total, dirty: total, clean: 0 } : { total, dirty: 0, clean: total }; }
    // no record of what paid for it: Dirty-origin at the old resale base, as the save loader assumes
    const P = e.prov || { dirty: Math.round(carMsrp(e.type) * 0.5), clean: 0 }, put = P.dirty + P.clean;
    total = Math.floor(Math.min(total, put * RESALE_CAP) / 10) * 10;
    const dirty = put > 0 ? Math.round(total * P.dirty / put) : total;
    return { total, dirty, clean: total - dirty };
  }
  // the garage as a collection: models owned of every model there is, rare finds, what it is all worth
  collection() {
    const s = this.g.save, models = new Set(s.garage.map(e => e.type)), all = Object.keys(VEHICLES).filter(k => !VEHICLES[k].police && k !== 'gangcar');
    const rare = s.garage.filter(e => e.vtier === 'rare'), byTier = {};
    for (const e of s.garage) byTier[e.vtier || VEHICLES[e.type].tier] = (byTier[e.vtier || VEHICLES[e.type].tier] || 0) + 1;
    return { models: models.size, of: all.length, rare: rare.length, rareModels: new Set(rare.map(e => e.type)).size, rareOf: RARE_TYPES.length, value: s.garage.reduce((a, e) => a + this.sellPrice(e), 0), byTier };
  }
  classK(type) { return 0.8 + Math.min(1.4, carMsrp(type) / 30000); }
  repairCost(type, health) { const d = this.g.uw ? this.g.uw.props.perk('repair') : 0; return Math.max(60, Math.round((100 - health) * 9 * this.classK(type) * (1 - d) / 10) * 10); }
  tunePrice(t, lv, type) { const d = this.g.uw ? this.g.uw.props.perk('repair') : 0; return Math.round(t.prices[lv] * this.classK(type) * (1 - d) / 10) * 10; }
  // the salesperson at a dealership's desk: what is on the lot, where it stands, and when new stock arrives
  openDealer(lot = 'new') {
    const g = this.g, s = g.save, D = DEALERSHIPS[lot], DL = g.dealers; if (!D || !DL) return;
    DL.restock();
    const render = () => {
      const st = DL.state(lot), cars = st.cars;
      const next = Math.max(0, st.d + D.every - DL.day);
      let h = `<div class="svcTop"><span>Rep <b>${s.rep}</b></span><span>Garage <b>${s.garage.length} / ${this.garageCap}</b></span><span>${Money.html(lot === 'used' ? 'usedLot' : 'dealer')}</span></div>`;
      h += `<div class="hint" style="margin:6px 0">${cars.filter(Boolean).length} cars on the lot · ${lot === 'new' ? 'sold cars are replaced overnight' : `new stock ${next ? `in ${next} day${next > 1 ? 's' : ''}` : 'tomorrow'}`}. Walk up to a car to inspect it and buy it where it stands.</div><div class="grid2">`;
      h += cars.map((c, i) => c ? `<div class="card"><div class="t">${esc(VEHICLES[c.type].name)} ${tierChip(c.vtier)}${c.bargain ? '<span class="chip" style="--c:#7fe08f">BARGAIN</span>' : ''}</div>
        <div class="d">${esc(CAR_CLASS[c.type] || '')}${lot === 'used' ? ` · ${condLabel(c.cond)[0]} (${c.cond}%) · ${c.km.toLocaleString()} km` : ''}</div>
        <div class="stat"><span>Price</span><span class="money">${fmtMoney(c.price)}</span></div><div class="stat"><span>Cargo Capacity</span><span>${fmtLb(cargoCapC(c.type))}</span></div><div class="btns"><button class="sbtn" data-act="show:${i}">Show me</button></div></div>` : '').join('');
      return h + '</div>';
    };
    this.openSvc(D.name, D.pitch, render, act => {
      const [k, a] = act.split(':');
      if (k === 'show') { const v = DL.carAt(lot, +a); if (v) { g.ui.closeAll(); this.setWaypoint(v.pos.x, v.pos.z, VEHICLES[v.type].name); } }
    });
  }
  // walking up to a car on a lot: everything about it, and buy it where it stands
  openLotCar(lot, i) {
    const g = this.g, s = g.save, D = DEALERSHIPS[lot], DL = g.dealers;
    const render = () => {
      const c = DL.state(lot).cars[i]; if (!c) return '<div class="hint">Sold.</div>';
      const V = VEHICLES[c.type], why = DL.cantBuy(lot, c);
      const cl = condLabel(c.cond);
      return `<div class="svcTop"><span>Rep <b>${s.rep}</b></span><span>Garage <b>${s.garage.length} / ${this.garageCap}</b></span><span>${Money.html(lot === 'used' ? 'usedLot' : 'dealer')}</span></div>
        <div class="card"><div class="t">${esc(V.name)} ${tierChip(c.vtier)}${c.bargain ? '<span class="chip" style="--c:#7fe08f">BARGAIN</span>' : ''}</div>
        <div class="d">${esc(CAR_CLASS[c.type] || '')} · ${esc(V.blurb)}</div>
        <div class="stat"><span>Price</span><span class="money"><b>${fmtMoney(c.price)}</b>${lot === 'used' ? ` <small style="color:var(--dim)">new ${fmtMoney(carMsrp(c.type))}</small>` : ''}</span></div>
        ${lot === 'used' ? `<div class="stat"><span>Condition</span><span style="color:${cl[1]}"><b>${cl[0]}</b> · ${c.cond}%</span></div><div class="bar"><i style="width:${c.cond}%;background:${cl[1]}"></i></div><div class="stat"><span>Mileage</span><span>${c.km.toLocaleString()} km</span></div>` : '<div class="stat"><span>Condition</span><span style="color:var(--green)"><b>New</b> · 0 km</span></div>'}
        ${this._bars(c.type)}
        <div class="stat"><span>Weight · seats</span><span>${V.mass.toLocaleString()} kg · ${V.profile === 'roadster' || V.profile === 'mid' || V.profile === 'wedge' ? 2 : V.profile === 'van' || V.profile === 'truck' || V.profile === 'minivan' ? 3 : 4}</span></div>
        <div class="stat cargoCap"><span>Cargo Capacity</span><span><b>${fmtLb(cargoCapC(c.type))}</b></span></div>
        <div class="btns"><button class="sbtn gold" data-act="buy" ${why ? 'disabled' : ''}>${why ? esc(why) : 'Buy · ' + fmtMoney(c.price)}</button><button class="sbtn" data-act="steal">Steal it · ${DEALER_THEFT[lot]}★</button></div></div>`;
    };
    const c0 = DL.state(lot).cars[i];
    this.openSvc(`${D.name}`, lot === 'used' ? 'Sold as seen. Condition is what Dex would charge to put right.' : 'Full warranty. Keys in the ignition.', render, act => {
      if (act === 'steal') { g.ui.ask(`Steal the ${VEHICLES[DL.state(lot).cars[i].type].name}?`, `The alarm goes the moment you open it: about ${DEALER_THEFT[lot]}★. It stays stolen (HOT) after you lose them.`, 'Steal it', () => { const r = DL.steal(lot, i); if (r) { this.refreshSvc(r); return; } g.ui.closeAll(); }); return; }
      if (act !== 'buy') return;
      const c = DL.state(lot).cars[i]; if (!c || c !== c0 || DL.cantBuy(lot, c)) { this.refreshSvc(); return; }
      g.ui.ask(`Buy the ${VEHICLES[c.type].name}?`, `${fmtMoney(c.price)}. It’s yours where it stands: drive it off the lot.`, 'Buy', () => {
        const r = DL.buy(lot, i);
        if (r) { this.refreshSvc(r); return; }
        g.ui.closeAll();
      });
    });
  }
  // Okafor Motor Works, the Pay & Spray (§45.30): repair, respray, and with the police after you a fresh coat that
  // loses them if no cop is watching. It never cleans HOT and never makes a car legally yours; tuning is for cars
  // that are legally yours
  serviceVehicle() {
    const g = this.g, p = g.player, bay = g.world.places.motorworks.bay;
    if (p.state === 'vehicle' && Math.hypot(p.vehicle.pos.x - bay.x, p.vehicle.pos.z - bay.z) < 7) return p.vehicle;
    let best = null, bd = 9;
    for (const v of g.vehicles.nearby(bay.x, bay.z, 9)) { const d = Math.hypot(v.pos.x - bay.x, v.pos.z - bay.z); if (d < bd && !v.burnt && (v === p.lastVehicle || v.owned)) { bd = d; best = v; } }
    return best;
  }
  openService() {
    const g = this.g, s = g.save;
    const v = this.serviceVehicle();
    if (!v) {
      this.openSvc('Okafor Motor Works', 'Dex: “Bring the car into the bay out front and I’ll take a look. Repairs, paint, and if it’s yours, I can make it faster.”', () => `<div class="hint">No vehicle in the service bay. Drive one onto the yellow-striped apron in front of the workshop.</div>`, () => {});
      return;
    }
    const ent = v.garageUid ? s.garage.find(x => x.uid === v.garageUid) : null;
    const COLORS = [0xc0392b, 0x1c2833, 0xecf0f1, 0x2471a3, 0xf1c40f, 0x27ae60, 0x8e44ad, 0xd35400, 0x566573, 0x1abc9c, 0xc9a227, 0x7b241c];
    const render = () => {
      const rc = this.repairCost(v.type, v.health), dmg = v.health < 99.5 || v.broken || v.deformed > 0.05;
      const heat = g.police.level > 0, rp = heat ? 600 : 250;
      let h = `<div class="svcTop"><span>${v.spec.name} ${ent ? this.chip(ent.origin) : this.chip(v.origin || 'stolen')}</span><span>Condition <b>${Math.max(0, Math.round(v.health))}%</b></span><span>${Money.html('either')}</span></div><div class="grid2">`;
      h += `<div class="card"><div class="t">Repair</div><div class="d">Body, glass, lights and alignment. Good as new.</div><button class="sbtn gold" data-act="repair" ${!dmg || !Money.can(rc, 'garage') ? 'disabled' : ''}>${dmg ? fmtMoney(rc) : 'No damage'}</button></div>`;
      h += `<div class="card"><div class="t">Respray${heat ? ' & new plates' : ''}</div><div class="d">${heat ? 'Fresh paint and plates. If no cop is watching right now, they lose your description.' : 'Pick a colour.'}</div><div class="swatches">${COLORS.map(c => `<button class="sw" data-act="paint:${c}" style="background:#${c.toString(16).padStart(6, '0')}" ${!Money.can(rp, heat ? 'payAndSpray' : 'garage') ? 'disabled' : ''}></button>`).join('')}</div><div class="stat"><span>Cost</span><span>${fmtMoney(rp)}</span></div></div>`;
      if (heat) h += `<div class="card"><div class="t">Pay &amp; Spray · ${fmtMoney(600 + rc)}</div><div class="d">Repair and a new coat in one go. Loses a pursuit if no cop sees you come in. Stolen stays stolen: the plates still say what it is.</div><button class="sbtn gold" data-act="pns" ${!Money.can(600 + rc, 'payAndSpray') ? 'disabled' : ''}>Pay &amp; Spray</button></div>`;
      h += '</div><h3>Tuning</h3>';
      if (!ent || ent.hot) h += `<div class="hint">${ent ? 'Dex won’t tune a car with hot plates. The Chop Shop will, or get its papers cleaned first.' : 'Dex only tunes cars that are registered to you. Store this one in your garage first.'}</div>`;
      else {
        h += '<div class="grid2">' + TUNE.map(t => {
          const lv = ent.tune[t.id], max = lv >= 3, price = max ? 0 : this.tunePrice(t, lv, v.type), need = TUNE_REP[lv] || 0;
          const locked = !max && s.rep < need;
          return `<div class="card"><div class="t">${t.name}</div><div class="d">${t.desc}</div><div class="pips">${[0, 1, 2].map(i => `<i class="${i < lv ? 'on' : ''}"></i>`).join('')}</div><button class="sbtn gold" data-act="tune:${t.id}" ${max || locked || !Money.can(price, 'garage') ? 'disabled' : ''}>${max ? 'Maxed' : locked ? 'Needs ' + need + ' Rep' : 'Stage ' + (lv + 1) + ' · ' + fmtMoney(price)}</button></div>`;
        }).join('') + '</div>';
      }
      return h;
    };
    const hint = pick(['Dex: “Listen to that idle. Somebody’s been riding the clutch.”', 'Dex: “Paint’s the cheapest disguise in Port Valen.”', 'Dex: “I’ve seen worse. Not often, but I have.”']);
    this.openSvc('Okafor Motor Works', hint, render, act => {
      const [k, a] = act.split(':');
      if (k === 'repair') {
        const c = this.repairCost(v.type, v.health); if (!Money.pay(c, 'garage')) return;
        this.repair(v); s.stats.repairs++; g.audio.play('cash');
        if (ent) ent.dmg = 0;
      } else if (k === 'paint') {
        // a respray that sheds a live police description is Pay & Spray work, paid in Dirty Cash; a plain colour
        // change is ordinary licensed garage work, paid from the bank (§45.18)
        const heat = g.police.level > 0, c = heat ? 600 : 250; if (!Money.pay(c, heat ? 'payAndSpray' : 'garage')) return; v.colorHex = +a; v.mat.userData.u.uPaint.value.setHex(+a); if (ent) ent.color = +a;
        g.audio.play('cash');
        if (heat) { if (!g.police.visible) { g.police.clear('New paint, new plates. The police lost your description.'); } else g.ui.toast('A cop is watching the shop — the paint won’t fool them.', 'warn'); }
      } else if (k === 'pns') {
        // repair + respray + (unseen) the pursuit lost; HOT untouched
        const c = 600 + this.repairCost(v.type, v.health); if (g.police.level <= 0 || !Money.pay(c, 'payAndSpray')) return;
        this.repair(v); if (ent) ent.dmg = 0;
        const col = COLORS[Math.floor(Math.random() * COLORS.length)]; v.colorHex = col; v.mat.userData.u.uPaint.value.setHex(col); if (ent) ent.color = col;
        g.audio.play('cash');
        if (!g.police.visible) g.police.clear('Pay & Spray: new paint. The police lost your description.'); else g.ui.toast('A cop is watching the shop — the paint won’t fool them.', 'warn');
      } else if (k === 'tune' && ent && !ent.hot) {
        const t = TUNE.find(x => x.id === a), lv = ent.tune[a]; if (lv >= 3) return;
        const price = this.tunePrice(t, lv, v.type); if (s.rep < (TUNE_REP[lv] || 0) || !Money.pay(price, 'garage')) return; if (ent.prov) ent.prov.clean += price; ent.tune[a] = lv + 1; v.tune = ent.tune; g.audio.play('cash');
        if (TUNE.every(x => ent.tune[x.id] >= 3)) this.ach('tuned');
      }
      g.saveGame(); this.refreshSvc();
      if (g.campaign) g.campaign.onService(v);
    });
  }
  repair(v) {
    v.health = 100; v.broken = 0; v.align = 0; v.deformed = 0; v.fireT = 0; v.smokeT = 0;
    v.restoreGeo();
  }
  // Fuel & Go
  openStore() {
    const g = this.g, s = g.save, p = g.player;
    const render = () => `<div class="svcTop"><span>Health <b>${Math.round(p.health)} / ${p.maxHealth}</b></span><span>Vest <b>${Math.round(p.vest)}</b></span><span>${Money.html('either')}</span></div><div class="grid2">` + STORE_ITEMS.map(it => {
      const locked = it.rep && s.rep < it.rep;
      return `<div class="card"><div class="t">${it.name}</div><div class="d">${it.desc}</div><button class="sbtn gold" data-act="${it.id}" ${locked || !Money.can(it.price, it.pay) ? 'disabled' : ''}>${locked ? 'Needs ' + it.rep + ' Rep' : fmtMoney(it.price)}</button></div>`;
    }).join('') + '</div>';
    this.openSvc('Fuel & Go', 'Clerk: “Pumps are self-serve. Everything else, you pay me.”', render, id => {
      const it = STORE_ITEMS.find(x => x.id === id); if (!it || (it.rep && s.rep < it.rep) || !Money.can(it.price, it.pay)) return;
      let msg = '';
      if (id === 'snack') { if (p.health >= p.maxHealth) { this.refreshSvc('You’re not hungry.'); return; } p.health = Math.min(p.maxHealth, p.health + 40 * HP_SCALE); msg = 'Warm, greasy, perfect.'; }
      if (id === 'medkit') { if (p.health >= p.maxHealth) { this.refreshSvc('Nothing to patch up.'); return; } p.health = Math.min(p.maxHealth, p.health + 180); msg = 'Gauze, tape and something that stings. Better.'; }
      if (id === 'drink') { p.boostT = 60; msg = 'Your heart is now a drum solo. Sprint as much as you like for a minute.'; }
      if (id === 'vest') { if (p.vest >= VEST_MAX * 0.95) { this.refreshSvc('You’re already wearing a fresh one.'); return; } p.vest = VEST_MAX; msg = 'Strapped in. It’ll take the edge off.'; }
      if (id === 'scratch') { g.gamble.openScratch(); return; }
      if (id === 'map') {
        const left = g.world.packages.filter(pk => !s.packages[pk.id] && !s.hints[pk.id]);
        if (!left.length) { this.refreshSvc('Every spot on the map is already crossed out.'); return; }
        left.sort(() => Math.random() - 0.5).slice(0, 5).forEach(pk => { s.hints[pk.id] = 1; });
        msg = 'Five green crosses on the map. Open it with M.';
      }
      Money.pay(it.price, it.pay); g.audio.play('cash'); g.saveGame(); this.refreshSvc(msg);
    });
  }
  openWardrobe() {
    const g = this.g, s = g.save, o = s.outfit;
    const row = (key, label) => `<h3>${label}</h3><div class="swatches">${OUTFITS[key].map(c => `<button class="sw${o[key] === c ? ' on' : ''}" data-act="${key}:${c}" style="background:${c < 0 ? 'repeating-linear-gradient(45deg,#333 0 4px,#555 4px 8px)' : '#' + c.toString(16).padStart(6, '0')}" title="${c < 0 ? 'None' : ''}"></button>`).join('')}</div>`;
    const render = () => row('shirt', 'Jacket / shirt') + row('pants', 'Trousers') + row('cap', 'Cap') + row('shoes', 'Shoes') + row('hair', 'Hair');
    this.openSvc('Wardrobe', 'Changing clothes won’t fool a cop who’s already looking at you, but it’s free.', render, act => {
      const [k, v] = act.split(':'); o[k] = +v; g.player.applyOutfit(o); g.saveGame(); this.refreshSvc();
    });
  }
  openTipLine() {
    const g = this.g, s = g.save;
    const left = g.world.packages.filter(pk => !s.packages[pk.id] && !s.hints[pk.id]).length;
    const render = () => `<div class="hint">A corkboard of community notices, missing cats and a laminated sheet: “CRIME STOPPERS — information about contraband stashes rewarded.” Someone has scribbled under it: <i>“or bought.”</i></div><div class="grid2"><div class="card"><div class="t">Buy a tip</div><div class="d">Marks three unfound hidden packages on your map.</div><button class="sbtn gold" data-act="tip" ${!left || !Money.can(500, 'tipLine') ? 'disabled' : ''}>${left ? '$500' : 'Nothing left to tell'}</button></div></div>`;
    this.openSvc('Tip line', `${30 - Object.keys(s.packages).length} packages are still out there.`, render, () => {
      if (!Money.can(500, 'tipLine')) return;
      const l = g.world.packages.filter(pk => !s.packages[pk.id] && !s.hints[pk.id]);
      l.sort((a, b) => dist2(a.x, a.z, g.player.pos.x, g.player.pos.z) - dist2(b.x, b.z, g.player.pos.x, g.player.pos.z)).slice(0, 3).forEach(pk => { s.hints[pk.id] = 1; });
      Money.pay(500, 'tipLine'); g.audio.play('cash'); g.saveGame(); this.refreshSvc('Three locations marked on your map.');
    });
  }
  openLaptop() {
    const g = this.g, c = g.campaign;
    const render = () => c.boardHTML();
    this.openSvc('Job board', 'Story jobs are given in person — set a waypoint and go see them. Finished jobs can be replayed for half pay.', render, act => {
      const [k, id] = act.split(':');
      if (k === 'wp') { const ct = g.missions.contacts.find(x => x.id === id); if (ct) { this.setWaypoint(ct.x, ct.z, ct.name); this.refreshSvc(`Waypoint set: ${ct.name}.`); } }
      if (k === 'replay') { g.ui.closeAll(); g.relock(); c.startReplay(id); }
    });
  }
  setWaypoint(x, z, label) { this.waypoint = { x, z, label }; this.g.audio.play('ui'); }
  mapClick(x, z) {
    const g = this.g;
    let best = null, bd = 30;
    void best; void bd;
    for (const ct of g.missions.contacts) if (Math.hypot(ct.x - x, ct.z - z) < 30) { this.setWaypoint(ct.x, ct.z, ct.name); g.ui.toast(`Waypoint set: ${ct.name}.`); g.ui.toggleMap(false); return true; }
    return false;
  }
  // ------------------------------------------------------------ discovery
  _discover() {
    const g = this.g, p = g.player, s = g.save;
    if (p.interior) return;
    const zk = zoneKey(p.pos.x, p.pos.z);
    const inCity = p.pos.x > 0 && p.pos.z > 0 && p.pos.x < CITY && p.pos.z < CITY;
    if (inCity && !s.discovered.zones[zk]) {
      s.discovered.zones[zk] = 1;
      const z = ZONES[zk], n = Object.keys(s.discovered.zones).length;
      const el = $('zoneCard'); el.querySelector('b').textContent = z.name; el.querySelector('span').textContent = z.tag; el.querySelector('small').textContent = `DISTRICT DISCOVERED · ${n} / ${Object.keys(ZONES).length}`;
      el.style.setProperty('--zc', z.col);
      el.classList.remove('hidden', 'out'); void el.offsetWidth;
      clearTimeout(this._zc); this._zc = setTimeout(() => { el.classList.add('out'); setTimeout(() => el.classList.add('hidden'), 600); }, 4200);
      if (n > 1) this.addRep(5);
      if (n >= Object.keys(ZONES).length) this.ach('tourist');
    }
    for (const id in g.world.places) {
      if (s.discovered.places[id] || g.world.places[id].hidden) continue;
      const pl = g.world.places[id];
      if (Math.hypot(p.pos.x - pl.door.x, p.pos.z - pl.door.z) < 40) {
        s.discovered.places[id] = 1;
        if (id !== 'safehouse') g.ui.toast(`Discovered: ${pl.name}.`);
        if (SERVICE_PLACES.every(k => s.discovered.places[k])) this.ach('regular');
      }
    }
  }
  // ------------------------------------------------------------ police on foot at landmarks
  _updatePosts(dt) {
    const g = this.g, p = g.player, pl = g.world.places;
    this.postT -= dt; if (this.postT > 0) return; this.postT = 1;
    for (const ps of this.posts) {
      const place = pl[ps.place]; if (!place) continue;
      const x = place.door.x + ps.dx, z = place.door.z + ps.dz;
      const d = Math.hypot(p.pos.x - x, p.pos.z - z);
      if (ps.ped && !g.peds.peds.includes(ps.ped)) ps.ped = null;
      if (ps.ped) {
        // after a chase they walk back to their post
        if (g.police.level === 0 && ps.ped.brain !== copPost && ps.ped.brain !== copWalkBack && ps.ped.state !== 'down') { ps.ped.brain = copWalkBack; ps.ped.keep = true; ps.ped.home = { x, z }; ps.ped.postH = place.door.h + (ps.dx > 0 ? -0.4 : 0.4); }
        continue;
      }
      if (d > 110 || d < 35 || g.inView(x, 1, z, 1) && d < 70 || !g.peds.enabled || !g.police.enabled) continue;
      if (ps.place === 'stadium' && g.env.night < 0.5) continue;
      const c = g.peds.make('cop', copLook());
      c.x = x; c.z = z; c.y = groundY(x, z); c.state = 'free'; c.keep = true; c.brain = copPost; c.postH = place.door.h + (ps.dx > 0 ? -0.4 : 0.4); c.h = c.postH; c.fireT = 1; c.home = { x, z };
      g.peds.peds.push(c); g.police.cops.push(c);
      ps.ped = c;
    }
  }
  // ------------------------------------------------------------ guidance (intro steps, waypoint, next story job)
  _guide() {
    const g = this.g, p = g.player, s = g.save, m = g.missions;
    this.guideTarget = null; this.guideArrow = false;
    if (m.active || g.race && g.race.active) return;
    if (this.waypoint) {
      if (Math.hypot(p.pos.x - this.waypoint.x, p.pos.z - this.waypoint.z) < 12) { this.waypoint = null; g.ui.toast('Waypoint reached.'); }
      else { this.guideTarget = this.waypoint; this.guideArrow = true; g.ui.setObjective('▸ ' + this.waypoint.label + ' · ' + fmtDist(Math.hypot(p.pos.x - this.waypoint.x, p.pos.z - this.waypoint.z)), null, true); return; }
    }
    if (s.settings.guide && g.uw && !p.interior && g.uw.rank === 0 && s.stats.playTime < 240 && !g.uw.inJail) { g.ui.setObjective('$0 to your name. ' + RANKS[0].hint, null, true); return; }
    g.ui.setObjective(null);
  }
  // ------------------------------------------------------------ interaction hooks
  onInterior(id, entered) {
    const g = this.g;
    if (entered) {
      const def = this.interiors.def(id);
      g.ui.toast(def.name);
      if (id === 'safehouse' || id === 'penthouse') { const pt = id === 'safehouse' ? 'linden' : 'penthouse'; g.save.home = pt; g.autosave('Home'); }
    }
    if (g.campaign) g.campaign.onInterior(id, entered);
  }
  onAlarm() {
    const g = this.g;
    g.ui.toast('A guard spotted you! The alarm is ringing.', 'warn');
    g.audio.play('wanted');
    if (g.campaign) g.campaign.onAlarm();
  }
  canEnter(def) {
    const g = this.g, s = g.save;
    if (def.id === 'depot') return 'Chained shut. Tidewater doesn’t take visitors.';
    if (def.id === 'penthouse' && !s.owns.penthouse) return null;
    if (def.id === 'safehouse' && !(g.uw && g.uw.props.owned('linden'))) return null;
    if (def.id === 'police' && g.police.level > 0) return 'Walking into Police HQ with heat on you? Bad idea.';
    if (g.police.level > 0 && g.police.visible) return 'They’d follow you straight in. Break line of sight first.';
    return '';
  }
  // returns a prompt label or null; act() performs it
  findAction() {
    const g = this.g, p = g.player, pl = g.world.places, I = this.interiors;
    if (p.interior) {
      const sp = I.nearSpot(p); if (!sp) return null;
      return { label: sp.label, act: () => this.spotAct(sp.id) };
    }
    if (p.state === 'vehicle') {
      if (p.passenger) return null;
      const v = p.vehicle;
      if (v.speed < 3) {
        const gp = this.nearGarage(v.pos.x, v.pos.z, 4.2);
        if (gp) return { label: 'Store vehicle in garage', act: () => this.storeVehicle(v, gp), key: 'gar' };
        const bay = pl.motorworks.bay;
        if (Math.hypot(v.pos.x - bay.x, v.pos.z - bay.z) < 6) return { label: 'Okafor Motor Works service', act: () => this.openService(), key: 'svc' };
      }
      return null;
    }
    if (p.state !== 'foot') return null;
    // a taxi at the kerb (your called cab, or one stopped in traffic): hire or carjack
    if (!p.interior) for (const v of g.vehicles.nearby(p.pos.x, p.pos.z, 5)) {
      if (v.type !== 'taxi' || v.burnt || v.speed > 2.5 || !(v.mode === 'kin' || g.taxi.isCab(v)) || (g.taxi.isCab(v) && g.taxi.state === 'riding')) continue;
      const lp = v.toLocal(p.pos.x, p.pos.z), d = Math.hypot(Math.max(0, Math.abs(lp.x) - v.spec.w / 2), Math.max(0, Math.abs(lp.z) - v.spec.l / 2));
      if (d < 1.6) return { label: 'Taxi · hire or carjack', act: () => g.taxi.approach(v) };
    }
    const gp = this.nearGarage(p.pos.x, p.pos.z, 3.2);
    if (gp) return { label: 'Garage', act: () => this.openGarage(gp) };
    // dealerships: a car on the lot, or the salesperson's desk
    if (!p.interior && g.dealers) {
      const lc = g.dealers.nearCar(p);
      if (lc) return { label: `Inspect ${VEHICLES[lc.c.type].name} · ${fmtMoney(lc.c.price)}${lc.lot === 'used' ? ' · ' + condLabel(lc.c.cond)[0].toLowerCase() : ''}`, act: () => this.openLotCar(lc.lot, lc.i) };
      for (const lot in DEALERSHIPS) { const dp = pl[DEALERSHIPS[lot].place]; if (dp && dp.desk && Math.hypot(p.pos.x - dp.desk.x, p.pos.z - dp.desk.z) < 2.4) return { label: `Talk to the salesperson · ${DEALERSHIPS[lot].name}`, act: () => this.openDealer(lot) }; }
    }
    const bay = pl.motorworks.bay;
    if (Math.hypot(p.pos.x - bay.x, p.pos.z - bay.z) < 4) return { label: 'Ask Dex about your car', act: () => this.openService() };
    const hd = this.nearHomeDoor(p);
    if (hd) return hd;
    const cd = pl.casino && pl.casino.door;
    if (cd && Math.hypot(p.pos.x - cd.x, p.pos.z - cd.z) < 2.6) return { label: 'Enter The Valen Royale', act: () => this.enterCasino() };
    const def = I.nearDoor(p);
    if (def) {
      const why = this.canEnter(def);
      if (why === null) { const pid = def.id === 'safehouse' ? 'linden' : def.id; return g.uw && PROP_BY_ID[pid] ? { label: `${PROP_BY_ID[pid].name} · for sale ${fmtMoney(g.uw.props.price(PROP_BY_ID[pid]))}`, act: () => g.uw.ui.openProp(pid) } : null; }
      if (def.id === 'safehouse') return { label: 'Enter your house', act: () => why ? this.deny(why) : I.enter(def.id) };
      return { label: `Enter ${def.id === 'penthouse' ? 'your penthouse' : def.name}`, act: () => why ? this.deny(why) : I.enter(def.id) };
    }
    return null;
  }
  deny(why) { this.g.ui.toast(why, 'warn'); this.g.audio.play('deny'); }
  enterCasino() {
    const g = this.g;
    if (g.police.level > 0) { this.deny('Security steps in front of the doors. “Not with the police on you.”'); return; }
    const def = this.interiors.addDynamic(casinoInteriorDef());
    this.interiors.enter(def.id);
  }
  // a house front door within reach: enterable homes are the ladder's and about a third of the rest
  nearHomeDoor(p) {
    const g = this.g;
    let best = null, bd = 2.0;
    for (const h of g.world.homes) { const d = Math.hypot(p.pos.x - h.door.x, p.pos.z - h.door.z); if (d < bd) { bd = d; best = h; } }
    if (!best || best.propId === 'linden') return null;
    if (best.propId) return null; // the ladder's doors are property locations (Underworld handles them)
    if (hash2i(best.x0 | 0, best.z0 | 0, 61) > 0.38 || best.type === 'farm') return null;
    if (g.police.level > 0) return { label: 'Break in (not with the police on you)', act: () => this.deny('Lose the heat first.') };
    return { label: best.type === 'apartment' ? 'Slip into an apartment' : 'Break in', act: () => { g.police.crime('theft', p.pos.x, p.pos.z); const def = this.interiors.addDynamic(houseInteriorDef(best, null)); this.interiors.enter(def.id); } };
  }
  offerPenthouse() {
    const g = this.g, s = g.save;
    if (this.g.save.rep < 1300) { this.deny('The concierge looks you up and down. “The penthouse is for people with a name, not errand runners.” (1300 Rep)'); return; }
    if (!Money.can(25000, 'property')) { this.deny('The penthouse costs $25,000 from your bank. Come back with clean money.'); return; }
    g.ui.ask('Buy the Valen Tower penthouse?', '$25,000. A second safehouse with a skyline view, and four more garage slots at the tower.', 'Buy', () => {
      Money.pay(25000, 'property'); s.owns.penthouse = true; s.home = 'penthouse';
      g.audio.play('pass'); g.ui.banner('Moving Up', 'Valen Tower Penthouse', 'pass', 3.5);
      this.ach('home'); this.phone('pv', 'Valen Courier: mystery buyer snaps up the Valen Tower penthouse. Neighbours "intrigued".');
      g.saveGame();
    });
  }
  spotAct(id) {
    const g = this.g, p = g.player, I = this.interiors;
    if (id.startsWith('g:')) { g.gamble.spot(id); return; }
    if (id.startsWith('c:')) { this.searchContainer(+id.slice(2)); return; }
    if (id.startsWith('w:')) { g.uw.compounds.spot(id.slice(2)); return; }
    if (id.startsWith('rv:')) { g.uw.rivalwh.spot(id.slice(3)); return; }
    switch (id) {
      case 'exit': I.exit(); break;
      case 'bed': g.uw.props.sleep(I.cur && I.cur.propId ? I.cur.propId : I.cur && I.cur.id === 'penthouse' ? 'penthouse' : 'linden'); break;
      case 'elevator': this.openElevator(); break;
      case 'concierge': if (g.uw.props.owned('penthouse')) this.say('pv', pick(['Welcome home. Your car is downstairs whenever you want it.', 'Good evening. Nobody has asked for you. Nobody would dare.'])); else g.uw.ui.openProp('penthouse'); break;
      case 'view': g.ui.toast('The whole city at your feet: the stadium, the cranes at the port, Greenway Park, Crestmoor on the point.'); g.audio.play('ui'); break;
      case 'stash': if (I.cur && I.cur.propId) g.uw.ui.openProp(I.cur.propId); break;
      case 'motorcourt': g.vspaces.enter(g.vspaces.byProp('mansion'), null); break;
      case 'loot': this.burgle(); break;
      case 'pool': g.audio.play('ui'); g.ui.toast(pick(['You break and sink two. The rest is a mess.', 'Bank shot off the cushion. Nobody saw it.', 'You clear the table in four. A shame nobody was watching.'])); break;
      case 'fridge': case 'bar':
        p.health = Math.min(p.maxHealth, p.health + 30 * HP_SCALE); g.audio.play('pickup'); g.ui.toast(id === 'bar' ? 'Something amber over ice. +90 health.' : 'Cold pizza. +90 health.'); break;
      case 'tv': g.uw.ui.open('feed'); break;
      case 'laptop': g.uw.ui.open('overview'); break;
      case 'wardrobe': this.openWardrobe(); break;
      case 'garage': if (I.cur && I.cur.dynamic) this.toGarage(I.cur); else this.openGarage(this.garagePoints()[0]); break;
      case 'clerk': if (I.cur && I.cur.store && this.storeState(I.cur).reg === this.g.uw.S.day) { this.say('pv', 'The clerk is shaking too hard to ring anything up. Come back another day.'); break; } this.openStore(); break;
      case 'register': case 'staff': case 'safe': case 'desk': case 'stock': this.storeHeist(id); break;
      case 'slot': g.gamble.openSlot('fuel'); break;
      case 'counter': this.openService(); break;
      case 'board': this.openTipLine(); break;
      case 'desk': this.say('moss', g.police.level > 0 ? 'Not now.' : pick(['Desk sergeant’s on break. Take a number.', 'If you’re here to confess, the line’s around the block.', 'Port Valen PD. How can we help?'])); break;
    }
  }
  // ------------------------------------------------------------ Valen Tower elevator
  openElevator() {
    const g = this.g, own = g.uw.props.owned('penthouse'), I = this.interiors, V = g.vspaces;
    const here = I.cur ? I.cur.id : g.player.interior && g.player.interior.vspace ? 'garage' : null;
    const render = () => `<div class="hint">${own ? 'Residents’ express lift.' : 'The penthouse and residents’ garage need a resident’s key card.'}</div><div class="btns" style="display:flex;flex-direction:column;gap:8px">
      <button class="sbtn ${here === 'penthouse' ? '' : 'gold'}" data-act="ph" ${!own || here === 'penthouse' ? 'disabled' : ''}>▲ Penthouse · floor 64</button>
      <button class="sbtn ${here === 'lobby' ? '' : 'gold'}" data-act="lobby" ${here === 'lobby' ? 'disabled' : ''}>◆ Lobby</button>
      <button class="sbtn ${here === 'garage' ? '' : 'gold'}" data-act="garage" ${!own || here === 'garage' ? 'disabled' : ''}>▼ Garage · B2</button></div>`;
    this.openSvc('Elevator', 'Valen Tower', render, act => {
      g.ui.back();
      if (act === 'ph' && own) this.ride(() => I.enter('penthouse', true));
      if (act === 'lobby') this.ride(() => I.enter('lobby', true));
      if (act === 'garage' && own) V.enter(V.byProp('penthouse'), null);
    });
  }
  // an elevator ride: leave any drive-in garage, dip to black, arrive
  ride(go) {
    const g = this.g, p = g.player;
    g.audio.play('ui');
    g.fade(() => { if (p.interior && p.interior.vspace) { p.interior = null; g.vspaces.reset(); } go(); });
  }
  // ------------------------------------------------------------ houses
  homeOf(id) { const d = PROP_BY_ID[id]; if (!d || !d.home) return null; const w = this.g.world; return w.homes.find(h => h.id === d.home) || (w.flats || []).find(h => h.id === d.home) || null; }
  // viewing: a home for sale, shown by the agent (its owner's things are still in it, and still searchable);
  // breakin: the same house entered through the back
  enterHome(id, viewing, breakin) {
    const g = this.g, I = this.interiors, home = this.homeOf(id); if (!home) return;
    const prop = viewing ? null : PROP_BY_ID[id];
    const def = I.addDynamic(houseInteriorDef(home, prop));
    if (viewing) { def.viewing = !breakin; def.name = PROP_BY_ID[id].name + (breakin ? '' : ' (viewing)'); }
    const p = g.player;
    if (p.interior && p.interior.vspace) { this.ride(() => { I.enter(def.id, true); }); return; }
    I.enter(def.id);
  }
  // from the hallway door into the attached garage, beside the cars
  toGarage(def) {
    const g = this.g, home = g.world.homes.find(h => h.id === def.home); if (!home || !home.garageRect) return;
    const r = home.garageRect, x = (r.x0 + r.x1) / 2, z = (r.z0 + r.z1) / 2;
    const gd = g.doors.byId('gd:' + def.propId); if (gd) { gd.force = true; setTimeout(() => { gd.force = false; }, 6000); }
    this.interiors.exit(true);
    g.fade(() => { g.player.pos.set(x, groundY(x, z), z); g.player.h = home.door.h; g.cam.init = false; });
  }
  // ------------------------------------------------------------ timed actions
  // An action that takes a few seconds of standing still (cracking a safe, a prison shift). Moving
  // away, taking a hit, a menu or an arrest cancels it. One at a time.
  channel(label, secs, done, opt = {}) {
    const p = this.g.player;
    if (this.chan) return false;
    this.chan = { label, secs, t: 0, done, x: p.pos.x, z: p.pos.z, hp: p.health, cancel: opt.cancel || null, r: opt.r || 1.6 };
    const el = $('chanBar'); el.querySelector('.cl').textContent = label; el.classList.remove('hidden');
    return true;
  }
  cancelChannel(why) {
    const c = this.chan; if (!c) return;
    this.chan = null; $('chanBar').classList.add('hidden');
    if (c.cancel) c.cancel(why);
    if (why) this.g.ui.toast(why, 'warn');
  }
  _updateChannel(dt) {
    const c = this.chan; if (!c) return;
    const g = this.g, p = g.player;
    if (g.state !== 'playing' || p.state !== 'foot') { this.cancelChannel(null); return; }
    if (Math.hypot(p.pos.x - c.x, p.pos.z - c.z) > c.r) { this.cancelChannel('Stopped: you walked away.'); return; }
    if (p.health < c.hp - 1) { this.cancelChannel('Stopped: you were hit.'); return; }
    if (dt > 0) c.t += dt;
    $('chanBar').querySelector('.bar i').style.width = Math.min(100, c.t / c.secs * 100) + '%';
    if (c.t >= c.secs) { this.chan = null; $('chanBar').classList.add('hidden'); c.done(); }
  }
  // ------------------------------------------------------------ burglary
  // A house that isn't yours: its drawers, wardrobes and the odd safe are searched one at a time. Each
  // container is rolled from a seeded loot table for this house and this week; searched containers stay
  // empty until the week turns. Every search makes a little noise; a neighbour may call it in.
  burgleState(def) {
    const fl = this.g.save.flags.burgled || (this.g.save.flags.burgled = {}), week = Math.floor(this.g.uw.S.day / 7);
    let st = fl[def.home];
    if (!st || typeof st !== 'object' || st.w !== week) st = fl[def.home] = { w: week, s: [] };
    return st;
  }
  // what a container holds (deterministic for the house, the container and the week); at least one
  // container in every house has some cash in it
  containerLoot(def, i) {
    const week = Math.floor(this.g.uw.S.day / 7), tier = def.tier || 2;
    const rolls = def.containers.map(c => rollLoot(c.kind, tier, mulberry32((def.seed + 1) * 7919 + c.i * 104729 + week * 31)));
    if (!rolls.some(r => r.cash > 0)) { const j = def.containers.findIndex(c => c.kind !== 'bath' && c.kind !== 'safe'); if (j >= 0) rolls[j] = { cash: Math.round(LOOT_CASH[clamp(tier, 1, 6) - 1] * 0.8) }; }
    return rolls[i];
  }
  searchContainer(i) {
    const g = this.g, def = this.interiors.cur; if (!def || !def.containers || def.owned) return;
    const c = def.containers[i]; if (!c) return;
    const st = this.burgleState(def);
    if (st.s.includes(i)) { g.ui.toast(`You already went through the ${LOOT_KIND[c.kind].label}.`, 'warn'); return; }
    const K = LOOT_KIND[c.kind];
    const finish = () => {
      const st2 = this.burgleState(def); if (st2.s.includes(i)) return;
      st2.s.push(i);
      const L = this.containerLoot(def, i), got = [];
      if (L.cash > 0) { g.earn(L.cash, 'burglary'); got.push(fmtMoney(L.cash)); }
      if (L.goods) { const r = g.uw.give(L.goods, 'burglary'); if (r) got.push(L.name ? `${L.name} (${goodsList(r)})` : goodsList(r)); }
      if (L.ammo > 0) { g.save.ammo.pistol = (g.save.ammo.pistol || 0) + L.ammo; got.push(`${L.ammo} pistol rounds`); }
      if (L.gun && !g.save.weapons[L.gun]) { g.save.weapons[L.gun] = true; if (g.save.wloc) g.save.wloc[L.gun] = null; got.push('a ' + (WEAPONS.find(w => w.id === L.gun) || { name: L.gun }).name); }
      if (got.length) { g.audio.play('pickup'); g.ui.toast(`${K.label[0].toUpperCase() + K.label.slice(1)}: ${got.join(', ')}.`, 'money'); }
      else { g.audio.play('ui'); g.ui.toast(pick(['Nothing worth taking.', 'Old receipts and a dead phone charger.', 'Empty.', 'Socks. Just socks.'])); }
      g.save.stats.burglaries = (g.save.stats.burglaries || 0) + 1;
      // noise: a neighbour hears it; a safe is loud
      const noise = c.kind === 'safe' ? 0.35 : 0.07 + st2.s.length * 0.015;
      if (Math.random() < noise) { const d = def.door; g.police.crime('theft', d.x, d.z); g.ui.toast('A neighbour heard something and is calling it in. Get out.', 'warn'); }
    };
    if (K.slow) this.channel(`CRACKING THE ${K.label.toUpperCase()}`, K.slow, finish);
    else { g.audio.play('ui'); finish(); }
  }
  // ------------------------------------------------------------ robbing a Fuel & Go
  // The register (once a day per station), the staff door behind the counter, and the back office:
  // the desk, the stockroom and the safe (once a week each). The clerk hits the silent alarm more often
  // than not; a safe's alarm brings more police. A robbed clerk hands over the back-office key.
  storeState(def) {
    const fl = this.g.save.flags.storeHit || (this.g.save.flags.storeHit = {}), week = Math.floor(this.g.uw.S.day / 7);
    let st = fl[def.id]; if (!st || typeof st !== 'object' || st.w !== week) st = fl[def.id] = { w: week, reg: -1, safe: false, desk: false, stock: false };
    return st;
  }
  openStaffDoor(def, open) {
    def.staffOpen = open;
    const c = def.cols && def.cols[def.staffCol]; if (c) c.on = !open;
    if (def.staffMesh) { def.staffMesh.position.x = open ? 3.2 + 0.55 : 3.2; def.staffMesh.position.z = open ? -1.8 - 0.55 : -1.8; def.staffMesh.rotation.y = open ? Math.PI / 2 : 0; }
  }
  // the clerk's silent alarm: the police are told about the robbery at this station
  silentAlarm(def, stars) {
    const g = this.g, d = def.door;
    g.police.crime('robbery', d.x, d.z);
    if (g.police.level < stars) g.police.setLevel(stars);
    g.ui.toast('Silent alarm. The police are on their way.', 'warn');
  }
  storeHeist(id) {
    const g = this.g, def = this.interiors.cur; if (!def || !def.store) return;
    const st = this.storeState(def), S = g.uw.S, armed = g.player.wep && !g.player.wep.melee;
    const area = ({ u: 1.4, c: 1.3, p: 1.25, a: 1.1, m: 1.1, l: 1.0, g: 1.0, o: 0.85, s: 0.85, w: 0.85, r: 0.8, h: 0.9 })[zoneKey(def.door.x, def.door.z)] || 1;
    if (id === 'register') {
      if (st.reg === S.day) { g.ui.toast('The till is empty. They dropped it in the safe after the last guy.', 'warn'); return; }
      if (!armed && Math.random() < 0.4) { st.reg = S.day; this.say('Clerk', 'Not today, pal. *slams the alarm*'); this.silentAlarm(def, 1); return; }
      this.channel(armed ? 'THE CLERK EMPTIES THE TILL' : 'LEANING ON THE CLERK', 3, () => {
        st.reg = S.day;
        const cash = Math.round((armed ? randi(180, 460) : randi(60, 200)) * area);
        g.earn(cash, 'heist'); g.audio.play('cash');
        g.save.stats.robberies = (g.save.stats.robberies || 0) + 1;
        this.say('Clerk', pick(['Take it, take it! The back office key too, just go!', 'Okay! Okay. Here. And the key to the back. Please.']));
        this.openStaffDoor(def, true);
        if (Math.random() < 0.75) this.silentAlarm(def, armed ? 2 : 1); else g.police.crime('robbery', def.door.x, def.door.z);
      });
      return;
    }
    if (id === 'staff') {
      if (def.staffOpen) { g.ui.toast('The back office is open.'); return; }
      this.channel('FORCING THE STAFF DOOR', 3.5, () => {
        this.openStaffDoor(def, true); g.audio.play('clank');
        if (st.reg !== S.day && Math.random() < 0.6) { this.say('Clerk', 'Hey! You can’t go back there! *picks up the phone*'); this.silentAlarm(def, 1); }
      });
      return;
    }
    if (st[id]) { g.ui.toast(id === 'safe' ? 'The safe is already empty. Cash pickup comes on Mondays.' : 'Already gone through it.', 'warn'); return; }
    const grab = () => {
      st[id] = true;
      if (id === 'safe') {
        const cash = Math.round(randi(1400, 4200) * area); g.earn(cash, 'heist'); g.audio.play('cash');
        const got = Math.random() < 0.35 ? g.uw.give({ hot: 1 + randi(0, 2) }, 'robbery') : null;
        g.ui.toast(`The safe: ${fmtMoney(cash)}${got ? ' and ' + goodsList(got) : ''}.`, 'money');
        if (Math.random() < 0.45) { g.audio.play('buzzer'); this.silentAlarm(def, 3); } else g.police.crime('robbery', def.door.x, def.door.z);
      } else if (id === 'desk') {
        if (Math.random() < 0.6) { const c = randi(40, 220); g.earn(c, 'heist'); g.ui.toast(`Petty cash in the desk: ${fmtMoney(c)}.`, 'money'); }
        else if (Math.random() < 0.5) { g.save.ammo.pistol = (g.save.ammo.pistol || 0) + 12; g.ui.toast('A box of pistol rounds in the drawer: 12 rounds.', 'money'); }
        else g.ui.toast('Invoices and a stale doughnut.');
      } else {
        const got = g.uw.give(Math.random() < 0.6 ? { smokes: randi(2, 5) } : { hot: randi(1, 2) }, 'robbery');
        g.ui.toast(got ? `From the stockroom: ${goodsList(got)}.` : 'Nothing you can carry right now.', got ? 'money' : 'warn');
      }
    };
    if (!def.staffOpen) { g.ui.toast('That’s behind the staff door.', 'warn'); return; }
    if (id === 'safe') this.channel('CRACKING THE OFFICE SAFE', 6, grab); else { g.audio.play('pickup'); grab(); }
  }
  // the old one-button search: the nearest container not searched yet
  burgle() {
    const g = this.g, def = this.interiors.cur; if (!def || !def.containers) return;
    const st = this.burgleState(def), left = def.containers.filter(c => !st.s.includes(c.i) && LOOT_KIND[c.kind] && !LOOT_KIND[c.kind].slow);
    if (!left.length) { g.ui.toast('Nothing left worth carrying.', 'warn'); return; }
    const p = g.player; left.sort((a, b) => Math.hypot(p.pos.x - def.ox - a.x, p.pos.z - def.oz - a.z) - Math.hypot(p.pos.x - def.ox - b.x, p.pos.z - def.oz - b.z));
    this.searchContainer(left[0].i);
  }
  // ------------------------------------------------------------ per frame
  update(dt, rdt) {
    const g = this.g;
    this._updateComms(rdt);
    this._updateChannel(dt);
    if (g.state !== 'playing') return;
    // (interiors.update runs once per frame from Game.update; calling it here too doubled guard speed)
    this._updatePackages(dt);
    this.checkT -= rdt;
    if (this.checkT <= 0) {
      this.checkT = 0.5;
      this._discover(); this._checkSecrets(); this._guide(); this._spawnGold();
      const pv = g.player.state === 'vehicle' ? g.player.vehicle : null;
      if (pv && pv.goldCar) this.secret('gold');
      if (pv && pv.rareFind && !g.save.flags.zephyrSeen) { g.save.flags.zephyrSeen = true; g.ui.toast('A Zephyr, just sitting up here. Store it in your garage to keep it.'); }
    }
    // pitch invader: drifting on the stadium pitch
    const p = g.player, pv = p.state === 'vehicle' ? p.vehicle : null, sc = g.world.places.stadium.center;
    if (pv && Math.hypot(pv.pos.x - sc.x, pv.pos.z - sc.z) < 18) {
      const lv = pv.localVel();
      if (pv.speed > 8 && Math.abs(Math.atan2(lv.x, Math.abs(lv.z))) > 0.45) { this.pitchT += dt; if (this.pitchT > 4) this.secret('pitch'); }
    }
    this._updatePosts(dt);
  }
  drawChars(cr) { this.interiors.drawChars(cr); }
  reset() {
    this.waypoint = null; this.phoneQ.length = 0; this.clearSubs();
    if (this.g.player.interior && this.g.player.interior.vspace) { this.g.player.interior = null; this.g.vspaces.reset(); }
    if (this.g.player.interior) this.interiors.exit(true);
    for (const ps of this.posts) ps.ped = null;
  }
  // ------------------------------------------------------------ phone & progress screens
  renderPhone() {
    const s = this.g.save;
    const msgs = s.messages.slice().reverse().map(m => `<div class="msg"><i style="background:${CONTACT_AVATAR[m.from] || '#8a8f96'}">${(CONTACT_NAMES[m.from] || m.from).replace(/[^A-Za-z]/g, '').charAt(0)}</i><div><b>${CONTACT_NAMES[m.from] || m.from}</b><small>${m.day || ''}</small><p>${m.text.replace(/</g, '&lt;')}</p></div></div>`).join('');
    $('phoneList').innerHTML = msgs || '<div class="hint">No messages yet.</div>';
    const cs = this.g.missions.contacts.map(c => {
      const st = this.g.campaign.contactStatus(c.id);
      return `<div class="msg"><i style="background:${CONTACT_AVATAR[c.id]}">${c.name.replace(/[^A-Za-z]/g, '').charAt(0)}</i><div><b>${c.name}</b><small>${c.role} · ${districtNameAt(c.x, c.z)}</small><p>${st}</p></div></div>`;
    }).join('');
    $('phoneContacts').innerHTML = cs;
  }
  renderProgress() {
    const g = this.g, s = g.save, c = g.campaign;
    const pct = c.percent();
    let h = `<div class="svcTop"><span>Completion <b>${pct}%</b></span><span>${g.uw ? `Rank <b>${esc(RANKS[g.uw.rank].name)}</b></span><span>` : ''}Rep <b>${s.rep}</b></span><span>Story <b>${c.doneCount()} / ${CAMPAIGN.length}</b></span></div>`;
    h += c.arcsHTML();
    const jumps = g.world.jumps.length, jd = Object.keys(s.jumps).length;
    const races = RACES.filter(r => !r.storyOnly);
    h += `<h3>Collections</h3><div class="stats">
      <span>Hidden packages</span><span>${Object.keys(s.packages).length} / 30</span>
      <span>Unique stunt jumps</span><span>${jd} / ${jumps}</span>
      <span>Secrets</span><span>${Object.keys(s.secrets).length} / ${SECRETS.length}</span>
      <span>Districts discovered</span><span>${Object.keys(s.discovered.zones).length} / ${Object.keys(ZONES).length}</span>
      <span>Street races won</span><span>${races.filter(r => s.races[r.id] && s.races[r.id].won).length} / ${races.length}</span>
      <span>Vehicles owned</span><span>${s.garage.length} / ${this.garageCap}</span></div>`;
    h += `<h3>Race records</h3><div class="stats">${RACES.map(r => `<span>${r.name}</span><span>${s.races[r.id] && s.races[r.id].best ? fmtRace(s.races[r.id].best) + (s.races[r.id].won ? ' ★' : '') : '—'}</span>`).join('')}</div>`;
    h += `<h3>Achievements · ${Object.keys(s.achievements).length} / ${ACHIEVEMENTS.length}</h3><div class="achGrid">${ACHIEVEMENTS.map(a => `<div class="achc${s.achievements[a.id] ? ' on' : ''}"><b>${a.name}</b><span>${a.desc}</span></div>`).join('')}</div>`;
    $('progressBody').innerHTML = h;
  }
}
function fmtRace(t) { const m = Math.floor(t / 60), sec = t - m * 60; return m + ':' + (sec < 10 ? '0' : '') + sec.toFixed(1); }

