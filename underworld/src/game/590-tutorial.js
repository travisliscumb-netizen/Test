/* =====================================================================
   TUTORIAL: short contextual tips, each shown once, when it becomes useful -
   never a forced opening mission. Seen tips live in save.tips; Settings can
   switch them off and bring them back.
   ===================================================================== */
const touchUI = g => IS_TOUCH && g.input.usingTouch;
const TUTORIAL = [
  { id: 'move', when: g => g.player.state === 'foot' && g.save.stats.playTime > 3,
    text: g => touchUI(g) ? 'Left thumb moves you. Drag anywhere on the right half of the screen to look around.' : 'WASD moves you, the mouse looks around. Shift sprints, Space jumps.' },
  { id: 'interact', when: g => !$('prompt').classList.contains('hidden'),
    text: g => `When a prompt appears, ${touchUI(g) ? 'tap USE' : 'press E'} to do it: doors, people, cars, shops.` },
  { id: 'money', when: g => g.uw && g.uw.rank === 0 && g.save.stats.playTime > 25,
    text: () => 'First money: steal a car and sell it at the Saltworks Chop Shop, or buy cheap smokes from Dockside Sully and sell them to street buyers. Street Connect (phone) shows who buys and who sells.' },
  { id: 'map', when: g => g.save.stats.playTime > 50,
    text: g => `The Map (${touchUI(g) ? 'the map button' : 'M'}) shows places, BUY ↓ and SELL $ points and your territory. Tap a place to track it or take a cab there.` },
  { id: 'phone', when: g => g.save.stats.playTime > 100,
    text: g => `Your phone (${touchUI(g) ? 'the phone button' : 'Tab'}) has apps: Market shows what your stock cost and what it’s worth, Street Connect finds dealers, Inventory and Stashes show what’s where.` },
  { id: 'drive', when: g => g.player.state === 'vehicle' && !g.player.passenger,
    text: g => touchUI(g) ? 'Steer with the left stick; GAS and BRAKE on the right (hold BRAKE to reverse). HB is the handbrake for tight turns. USE gets you out.' : 'W/S to drive and brake (hold S to reverse), A/D to steer, Space for the handbrake, E to get out.' },
  { id: 'product', when: g => g.uw && units(g.uw.carried()) > 0,
    text: () => 'You’re carrying product. Sell it to street buyers (map SELL layer) or stash it at a property you own: carried goods are seized if you’re arrested.' },
  { id: 'stash', when: g => g.uw && units(g.uw.carried()) > 0 && g.uw.props.ownedList().some(d => d.storage),
    text: () => 'Your property has a stash. Open its menu at the door to deposit or withdraw product, guns and ammo, or send a crew runner (Crew › Deliveries).' },
  { id: 'gun', when: g => g.player.state === 'foot' && g.player.wep && !g.player.wep.melee,
    text: g => touchUI(g) ? 'Gun out: right thumb aims, hold FIRE to shoot (you can move, aim and fire at once). The bullet goes where the crosshair is. ADS steadies your aim.' : 'Gun out: the mouse aims, left click fires, right click aims down the sights. The bullet goes where the crosshair is.' },
  { id: 'police', when: g => g.police.level > 0,
    text: () => 'Stars mean the police are after you. Break line of sight and stay out of view until they fade. No cab will stop while you’re wanted.' },
  { id: 'property', when: g => /for sale/.test($('prompt').textContent),
    text: () => 'Property is bought in person. Homes are safehouses with a stash and parking; businesses pay every day and launder your name.' },
  { id: 'garage', when: g => /Garage|garage/.test($('prompt').textContent),
    text: () => 'Drive a car you own into a free space and stop to park it. Cars you leave around town get towed home. The Garage app lists them all.' },
  { id: 'taxi', when: g => /Taxi/.test($('prompt').textContent),
    text: () => 'Hire the cab, pick any street on the map and see the fare first. Ride along, skip the drive, change destination or get out early.' },
  { id: 'jail', when: g => g.uw && g.uw.inJail,
    text: () => 'No phone and no map in here. Do chores (trays to the serving window, litter in the bin) for good-behaviour points: they unlock 2× and 3× time. Your businesses keep earning every day. Open “Prison life” for everything.' }
];
class Tutorial {
  constructor(g) {
    this.g = g; this.cur = null; this.t = 0; this.cool = 3; this.chk = 0;
    $('tip').querySelector('i').addEventListener('click', e => { e.stopPropagation(); this.dismiss(); });
  }
  get seen() { const s = this.g.save; return s.tips || (s.tips = {}); }
  get on() { return this.g.save.settings.guide !== false; }
  show(L) {
    const g = this.g, el = $('tip');
    this.seen[L.id] = 1; this.cur = L;
    const text = L.text(g);
    el.querySelector('span').textContent = text;
    el.classList.remove('hidden');
    this.t = clamp(text.length / 13, 7, 13);
  }
  hide() { $('tip').classList.add('hidden'); this.cur = null; }
  dismiss() { if (!this.cur) return; this.hide(); this.cool = 8; }
  reset() { this.g.save.tips = {}; this.hide(); this.cool = 2; }
  update(dt) {
    const g = this.g;
    if (g.state !== 'playing' || !this.on) { if (this.cur) this.hide(); return; }
    // a fade (arrest, interior, cab skip) moves you somewhere else: a tip about the old situation goes
    if (this.cur && g.fading) { this.hide(); this.cool = 4; return; }
    if (this.cur) { this.t -= dt; if (this.t <= 0) this.dismiss(); return; }
    this.cool -= dt; if (this.cool > 0) return;
    if (g.ui.modal || g.mapOpen || g.fading || (g.missions.active && g.police.level === 0)) return;
    this.chk -= dt; if (this.chk > 0) return; this.chk = 0.5;
    const seen = this.seen;
    for (const L of TUTORIAL) if (!seen[L.id] && L.when(g)) { this.show(L); return; }
  }
}

