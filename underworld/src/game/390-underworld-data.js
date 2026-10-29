/* =====================================================================
   [UNDERWORLD] DATA: goods, district demand, turfs, factions, properties,
   street locations, crew and corruption tables. Everything the crime
   simulation reads is declared here and indexed in GAME_CONFIG.underworld.
   All goods are fictional abstractions: the game models prices, risk and
   scarcity only; it never models how anything is made or moved for real.
   ===================================================================== */
const GOODS = {
  hot: { name: 'Hot Goods', tier: 0, base: 75, size: 1, heat: 0.3, fence: true, desc: 'Phones, watches, jewellery. Only a fence will take them.' },
  smokes: { name: 'Bootleg Smokes', tier: 0, base: 45, size: 1, heat: 0.25, desc: 'Untaxed cartons that fell off a container.' },
  green: { name: 'Green', tier: 1, base: 130, size: 1, heat: 0.6, desc: 'The city’s favourite leafy vice. Steady demand everywhere.' },
  pills: { name: 'Pharma', tier: 1, base: 240, size: 1, heat: 0.8, desc: 'Diverted prescriptions. Nightlife can’t get enough.' },
  snow: { name: 'Snow', tier: 2, base: 700, size: 1, heat: 1.4, desc: 'Premium party powder. Big money, big sentences.' },
  hardware: { name: 'Hardware', tier: 3, base: 1500, size: 2, heat: 2.2, arms: true, desc: 'Unregistered iron. Only arms buyers deal in it.' }
};
const GOOD_IDS = Object.keys(GOODS);
const TIERS = [{ name: 'LOW RISK', col: '#7fe08f', charge: 1 }, { name: 'MEDIUM RISK', col: '#ffd84d', charge: 3 }, { name: 'HIGH RISK', col: '#ff8a3d', charge: 8 }, { name: 'EXTREME RISK', col: '#ff4d5e', charge: 20 }];
// how much each district wants each good (1 = average)
const DEMAND = {
  c: { hot: 0.9, smokes: 0.6, green: 0.8, pills: 1.1, snow: 1.6, hardware: 0.6 },
  m: { hot: 1.0, smokes: 1.0, green: 1.1, pills: 1.2, snow: 1.1, hardware: 0.8 },
  o: { hot: 1.2, smokes: 1.3, green: 1.3, pills: 0.9, snow: 0.7, hardware: 1.1 },
  l: { hot: 0.8, smokes: 0.8, green: 1.25, pills: 1.3, snow: 0.9, hardware: 0.7 },
  s: { hot: 1.0, smokes: 1.3, green: 1.0, pills: 0.8, snow: 0.7, hardware: 1.3 },
  h: { hot: 1.0, smokes: 0.85, green: 0.9, pills: 0.8, snow: 0.8, hardware: 1.25 },
  g: { hot: 0.9, smokes: 1.0, green: 1.25, pills: 1.0, snow: 0.8, hardware: 0.7 },
  p: { hot: 1.0, smokes: 1.0, green: 1.1, pills: 1.6, snow: 1.6, hardware: 0.8 },
  w: { hot: 1.3, smokes: 1.2, green: 1.0, pills: 0.9, snow: 0.8, hardware: 1.3 },
  u: { hot: 0.7, smokes: 0.5, green: 1.0, pills: 1.4, snow: 1.7, hardware: 0.5 },
  a: { hot: 1.1, smokes: 1.2, green: 1.2, pills: 1.2, snow: 1.0, hardware: 0.7 },
  r: { hot: 0.8, smokes: 1.1, green: 1.4, pills: 0.7, snow: 0.5, hardware: 1.1 }
};
// nightlife districts want party goods after dark
const NIGHT_DEMAND = { p: 1.45, c: 1.15, m: 1.1, a: 1.2 };
const TURF_N = N / 2; // turfs are 2x2 blocks: a 6x6 grid of 36 sub-territories
const TURF_NAMES = {
  c: ['Exchange Row', 'Glass Mile', 'Kestrel Plaza', 'Bank Street', 'Tower Square', 'Ledger Lane'],
  m: ['Market Cross', 'Elm Corner', 'Union Square', 'Ash & Fifth', 'Diner Row', 'Central'],
  o: ['Ninth Street', 'Brick Lane', 'Cobble Yard', 'Saint Ivo', 'Tanner’s Row', 'Old Steps'],
  l: ['Linden Crescent', 'Maple Court', 'Cul-de-sac Nine', 'Hilltop', 'Orchard Way', 'Fairview'],
  s: ['Refinery Gate', 'Smelter Row', 'Slag Yards', 'Pipe Alley', 'Furnace Hill', 'Rail Spur'],
  h: ['Pier 4', 'Container Bay', 'Dry Dock', 'Quay 12', 'Crane Row', 'Customs Point'],
  g: ['Greenway Park', 'Fountain Walk'],
  p: ['Neon Mile', 'Velvet Row', 'Starlite Strip', 'Arcade Square', 'Stadium Lights', 'After Hours'],
  w: ['Cannery Row', 'Bonded Stores', 'Freight Yard', 'Loading Bay'],
  u: ['Crestmoor Drive', 'Bayview Heights', 'Old Money Row', 'Gatehouse Lane'],
  a: ['Stadium Lights', 'Gate C', 'Fan Plaza', 'Ring Road'],
  r: ['Cedar Fields', 'Mill Road', 'Orchard Lane']
};
const FACTIONS = {
  vipers: {
    name: 'Ninth Street Vipers', short: 'Vipers', col: '#4cd964', hex: 0x2fa84f, archetype: 'Street crew', home: 'o',
    goods: ['green', 'pills', 'hot'], cars: ['gangcar', 'compact'], carCol: [0x1f7a36, 0x2a7a3a], gun: 0.22, aggression: 0.75, start: { strength: 55, money: 9000 },
    boss: { name: 'Marlon “Fang” Reyes', title: 'Shot-caller', pers: 'hothead', look: { shirt: 0x1b1b1e, jacket: 0x1f5a2e, bandana: 0x2fa84f, chain: 0xd8b04a, build: 1.2, hairStyle: 0 } },
    lts: ['“Knuckles” Ortega', 'Tasha Vance', 'Little Dre', 'Rico Saldana'],
    blurb: 'Young, loud and territorial. They sell green on every corner of the Old Quarter and hit back hard.',
    member: { shirt: [0x1b1b1e, 0x2a2a2e, 0x1f5a2e], bandana: 0x2fa84f, pants: [0x22262c, 0x2b3448] }
  },
  tidewater: {
    name: 'Tidewater Syndicate', short: 'Tidewater', col: '#3fc1c9', hex: 0x1f8a92, archetype: 'Port smuggling syndicate', home: 'h',
    goods: ['snow', 'hardware', 'smokes'], cars: ['van', 'suv', 'utility'], carCol: [0x1a3d4a, 0x23344f], gun: 0.45, aggression: 0.45, start: { strength: 70, money: 42000 },
    boss: { name: 'Captain Arvid Holm', title: 'Harbourmaster', pers: 'calculating', look: { shirt: 0xd8d0c0, jacket: 0x1a2a3a, cap: 0x10161c, build: 1.15, hair: 0xd8d8d8, hairStyle: 1 } },
    lts: ['Sven Ackerly', 'Mara Quist', '“Bosun” Pell', 'Jonah Keel'],
    blurb: 'Everything that comes off a boat passes through them first. Patient, well armed, all business.',
    member: { shirt: [0x23344f, 0x2a3a46, 0x3a3a3a], jacket: 0x1a2a3a, cap: 0x10161c, pants: [0x22304a, 0x2a2a2e] }
  },
  velvet: {
    name: 'Velvet Circle', short: 'Velvet', col: '#e056fd', hex: 0xb03bd0, archetype: 'Nightlife organization', home: 'p',
    goods: ['pills', 'snow'], cars: ['luxury', 'sports'], carCol: [0x2a0f2e, 0x7a2b6e], gun: 0.3, aggression: 0.4, start: { strength: 45, money: 30000 },
    boss: { name: 'Celeste Duval', title: 'Madame', pers: 'charming', look: { shirt: 0x7a2b6e, jacket: 0x111111, skirt: 0x111111, chain: 0xd8b04a, shades: true, hairStyle: 2, hair: 0x111111, fem: true } },
    lts: ['Dorian Lisle', 'Kitty Marchetti', 'Velasco', 'June Okonkwo'],
    blurb: 'They own the clubs, the doors and whoever is behind the velvet rope. Charming until they aren’t.',
    member: { shirt: [0x7a2b6e, 0x2a0f2e, 0x111111], jacket: 0x111111, shades: true, pants: [0x111111, 0x22262c] }
  },
  bellcourt: {
    name: 'Bellcourt Family', short: 'Bellcourt', col: '#ec1c4c', hex: 0xb0163a, archetype: 'Old organized crime', home: 'm',
    goods: ['smokes', 'hardware', 'hot'], cars: ['luxury', 'sedan'], carCol: [0x111111, 0x1c2833], gun: 0.5, aggression: 0.5, start: { strength: 65, money: 60000 },
    boss: { name: 'Don Aurelio Bellcourt', title: 'Don', pers: 'honor', look: { shirt: 0xe8e8e8, jacket: 0x1b1b1e, tie: 0x8a2f3a, chain: null, build: 1.2, hair: 0xd8d8d8, hairStyle: 1 } },
    lts: ['Sal Bellcourt', 'Vito “The Ledger” Amato', 'Rosa Tedeschi', 'Nicky Two-Times'],
    blurb: 'Three generations of rackets, unions and favours. They expect respect and they keep their word.',
    member: { shirt: [0xe8e8e8, 0xd8d0c0], jacket: 0x1b1b1e, tie: 0x2a2a2e, pants: [0x1b1b1e, 0x22262c] }
  },
  glasshouse: {
    name: 'The Glasshouse', short: 'Glasshouse', col: '#8fa8ff', hex: 0x4d6dff, archetype: 'High-end criminal network', home: 'c',
    goods: ['snow'], cars: ['luxury', 'coupe'], carCol: [0xe8e6e0, 0x3a3f46], gun: 0.6, aggression: 0.35, start: { strength: 40, money: 120000 },
    boss: { name: 'Victor Kane', title: 'Chairman', pers: 'cold', look: { shirt: 0xe8e8e8, jacket: 0x3a3f46, tie: 0x2f5d8a, shades: true, build: 1.0, hair: 0x2e2018, hairStyle: 1 } },
    lts: ['Elise Harrow', 'Marcus Thorne', 'Dr. Ines Soler', 'Kade Whitlock'],
    blurb: 'Money men. They launder for everyone, own half the precinct and never get their hands dirty.',
    member: { shirt: [0xe8e8e8, 0xd8d0c0], jacket: 0x3a3f46, shades: true, tie: 0x2f5d8a, pants: [0x3a3f46, 0x2a2a2e] }
  }
};
const FAC_IDS = Object.keys(FACTIONS);
// zone -> faction that starts in control (l: nobody; w: contested)
const START_OWNER = { o: 'vipers', g: 'vipers', h: 'tidewater', s: 'tidewater', p: 'velvet', m: 'bellcourt', c: 'glasshouse', a: 'velvet' };
const PLAYER_COL = '#ffb547', PLAYER_HEX = 0xffb547;
// the seven player-facing Ranks (§1): how powerful you are, where Reputation (save.rep) is who knows you. Each Rank
// needs everything the Ranks below it need. Every condition is power money cannot buy (§1, §45.7): Reputation,
// active crew, Lieutenants running districts, turf held (it changes hands only through a showdown, §45.13) and
// influence (in which a business counts only once it is established). Underworld.rankOf is the one reader.
const RANKS = [
  { name: 'Nobody', need: {}, hint: 'Make your first money and a name: pickpocket, steal cars for the chop shop, fence hot goods. Reach 100 Rep.' },
  { name: 'Street Hustler', need: { rep: 100 }, hint: 'Reach 400 Rep: deals, races, scores and escapes all count.' },
  { name: 'Known Operator', need: { rep: 400 }, hint: 'Hire at least two crew (Empire → Crew), keep them paid, and keep your 400 Rep.' },
  { name: 'Crew Leader', need: { rep: 400, crew: 2 }, hint: 'Take 1 turf: weaken a rival’s hold until you can Take Turf (Empire → Turf map), then win the showdown. Get known: 800 Rep.' },
  { name: 'Territory Holder', need: { rep: 800, crew: 2, turfs: 1 }, hint: 'Hold 8 turfs with four crew, put a Lieutenant in charge of a district, reach 1,500 Rep and grow your influence past 450 (businesses can at most double what your turf and crew earn).' },
  { name: 'Underworld Power', need: { rep: 1500, crew: 4, turfs: 8, lts: 1, infl: 450 }, hint: 'Hold 16 turfs with six crew and two Lieutenants, 2,500 Rep, influence past 800 and a warehouse running (a Lieutenant and a Driver) to run the city.' },
  { name: 'City Kingpin', need: { rep: 2500, crew: 6, turfs: 16, lts: 2, infl: 800, wh: 1 }, hint: 'You run Port Valen. Now keep it.' }
];
const RANK_MAX = RANKS.length - 1;
// what each Rank condition is called when the UI explains what is missing
const RANK_NEED_TEXT = { rep: n => `${n} Rep`, crew: n => `${n} active crew`, turfs: n => `${n} turf${n === 1 ? '' : 's'} held`, lts: n => `${n} Lieutenant${n === 1 ? '' : 's'} running a district`, infl: n => `${n} influence`, wh: n => `${n} operating warehouse${n === 1 ? '' : 's'} (a Lieutenant and a Driver)` };
// purchasable property. at: [bx, bz, side, along] (side 0 N, 1 E, 2 S, 3 W) or place: existing world place
const PROPS = [
  { id: 'flop', name: 'Old Quarter Flop', kind: 'safehouse', price: 2500, at: [1, 4, 1, 40], storage: 40, garage: 0, crew: 0, desc: 'A room over a laundromat. A bed, a lock and somewhere to stash things.' },
  { id: 'linden', name: 'Linden Hills House', kind: 'safehouse', price: 14000, place: 'safehouse', interior: 'safehouse', storage: 90, garage: 2, crew: 1, desc: 'Quiet street, nosy neighbours, a real garage.' },
  { id: 'loft', name: 'Downtown Loft', kind: 'safehouse', price: 38000, at: [5, 2, 2, 30], storage: 120, garage: 3, crew: 1, desc: 'Exposed brick, a freight lift and a view of everybody else’s business.' },
  { id: 'penthouse', name: 'Valen Tower Penthouse', kind: 'safehouse', price: 150000, place: 'tower', interior: 'penthouse', storage: 160, garage: 6, crew: 2, luxury: true, desc: 'The top of the tallest tower on the island. People notice who lives here.' },
  { id: 'qgarage', name: 'Quarter Garage Lock-ups', kind: 'garage', price: 8000, place: 'garageRoof', storage: 20, garage: 4, crew: 0, desc: 'Four lock-ups and a mechanic who doesn’t ask. Repairs, respray and tuning at cost.' },
  { id: 'docklock', name: 'Pier 9 Lock-up', kind: 'garage', price: 6000, at: [10, 9, 3, 30], storage: 60, garage: 2, crew: 0, desc: 'A rusted roll door near the water. Cheap, private and close to the boats.' },
  { id: 'whse_w', name: 'Cannery Row Warehouse', kind: 'warehouse', price: 32000, place: 'cannery', storage: 600, garage: 1, crew: 15, desc: 'Bulk storage. Enough room to sit on product until the price is right.' },
  { id: 'whse_d', name: 'Tidewater Shed 4', kind: 'warehouse', price: 48000, place: 'shed4', storage: 900, garage: 2, crew: 15, desc: 'A bonded shed on the docks. Shipments land on your doorstep.' },
  { id: 'pawn', name: 'Lucky’s Pawn', kind: 'business', price: 18000, at: [2, 6, 0, 30], income: 420, storage: 60, crew: 2, fence: true, desc: 'The Old Quarter’s fence. Buy it and every hot watch in the city comes through your door.' },
  { id: 'bar', name: 'The Rusty Anchor', kind: 'business', price: 24000, at: [11, 6, 3, 25], income: 560, storage: 40, crew: 2, recruit: true, desc: 'A dockside bar full of people looking for work. Good for recruiting.' },
  { id: 'diner', name: 'Rosie’s Diner', kind: 'business', price: 26000, at: [6, 1, 3, 40], income: 620, storage: 30, crew: 2, desc: 'Coffee, pie and a back booth for meetings.' },
  // Valen Point (Session 6B): a legitimate asset bought from the bank, no Rank or Rep gate; its garage is the 24 pit
  // garage bays. Price provisional (Session 13)
  { id: 'offroad', name: 'Cedar Fields Off-Road Park', kind: 'offroad', price: 180000, place: 'offroad', garage: 6, storage: 0, desc: 'The off-road course’s compound in Cedar Fields South: six bays in the owners’ garage shed, the service stand (repairs a third off) and private sessions on the course whenever you like. Price provisional.' },
  { id: 'motorsport', name: 'Valen Point Motorsport Park', kind: 'motorsport', price: 1500000, place: 'motorsport', garage: 24, storage: 0, desc: 'The circuit, its pit garages and grandstands on Valen Point. Track days, race meetings, a garage for a whole collection, and a clean income.' },
  { id: 'carwash', name: 'Suds Car Wash', kind: 'business', price: 34000, at: [9, 2, 3, 40], income: 760, storage: 40, garage: 1, crew: 2, launder: true, respray: true, desc: 'Cleans cars and cash. Respray stolen rides on site.' },
  { id: 'motel', name: 'Starlite Motel', kind: 'business', price: 42000, at: [4, 9, 1, 35], income: 980, storage: 80, crew: 2, night: true, desc: 'Rooms by the hour on the Nightlife Strip. Discreet, profitable, never quiet.' },
  { id: 'club', name: 'Club Neon', kind: 'business', price: 95000, at: [5, 8, 2, 40], income: 2300, storage: 60, crew: 3, night: true, recruit: true, infl: 30, desc: 'The hottest door on the Strip. Whoever owns it owns the night.' },
  { id: 'boutique', name: 'Kane & Co. Boutique', kind: 'business', price: 65000, at: [7, 3, 2, 40], income: 1500, storage: 30, crew: 2, launder: true, infl: 15, desc: 'Designer labels and very clean books.' }
];
const PROP_BY_ID = Object.fromEntries(PROPS.map(p => [p.id, p]));
// ---- v6: the business economy. 50 businesses in 30 categories. Every category has its own benefit (a perk
// read by the system it affects) and its own three levels: bought (1), improved (2) and fully developed (3).
// lv: perk value at levels 1/2/3; inc: income multiple of the base at levels 1/2/3; up: what each upgrade does.
const BIZ_CATS = {
  laundromat: { name: 'Laundromat', icon: '🧺', col: '#7fb2ff', perk: 'launder', lv: [0.35, 0.6, 0.95], inc: [1, 1.45, 2.0], up: ['Industrial machines and a second shift: more washing, more clean cash', 'A chain of drop-off points: the books swallow anything'], benefit: v => `launders your heat: police pressure −${v.toFixed(2)} a day` },
  tattoo: { name: 'Tattoo studio', icon: '🖋', col: '#e056fd', perk: 'recruit', lv: [1, 2, 3], inc: [1, 1.5, 2.1], up: ['Two more chairs and a name artist', 'A studio people travel for: the hardest people in town sit in your chairs'], benefit: v => `${v} more recruit${v > 1 ? 's' : ''} on offer, tougher ones` },
  law: { name: 'Law firm', icon: '⚖', col: '#d8c8a0', perk: 'legal', lv: [0.15, 0.3, 0.45], inc: [1, 1.4, 1.9], up: ['A senior partner who used to be a prosecutor', 'Retired judges on the letterhead'], benefit: v => `lawyers ${Math.round(v * 100)}% cheaper with ${Math.round(v * 33)}% better odds` },
  barber: { name: 'Barber shop', icon: '💈', col: '#ff8a3d', perk: 'intel', lv: [0.08, 0.15, 0.24], inc: [1, 1.5, 2.1], up: ['A back room where men talk', 'Half the precinct gets a shave here'], benefit: v => `${Math.round(v * 100)}% better chance of a raid tip-off` },
  salon: { name: 'Hair salon', icon: '✂', col: '#ff7ab8', perk: 'intel', lv: [0.08, 0.15, 0.24], inc: [1, 1.55, 2.2], up: ['Spa chairs and the gossip that comes with them', 'The salon the wives of the city council use'], benefit: v => `${Math.round(v * 100)}% better chance of a raid tip-off` },
  gym: { name: 'Gym', icon: '🏋', col: '#7fe08f', perk: 'stamina', lv: [0.1, 0.2, 0.3], inc: [1, 1.5, 2.0], up: ['A boxing ring and coaches', 'A fight gym with a name: your crew trains here'], benefit: v => `you sprint ${Math.round(v * 100)}% longer; +1 crew room per level` },
  convenience: { name: 'Convenience store', icon: '🏪', col: '#46d4c4', perk: 'loyalty', lv: [0.1, 0.2, 0.3], inc: [1, 1.4, 1.85], up: ['Open all night, lottery counter', 'A second shop front and a delivery van'], benefit: v => `crew morale never below +${Math.round(v * 10)} (capped at ${MORALE_CAP})` },
  grocery: { name: 'Grocery store', icon: '🥬', col: '#8fe39b', perk: 'loyalty', lv: [0.15, 0.3, 0.45], inc: [1, 1.45, 1.95], up: ['A deli counter and a bakery', 'Supplying half the restaurants in the district'], benefit: v => `crew morale never below +${Math.round(v * 10)} (capped at ${MORALE_CAP})` },
  pharmacy: { name: 'Pharmacy', icon: '✚', col: '#7fe08f', perk: 'medic', lv: [0.25, 0.45, 0.65], inc: [1, 1.45, 2.0], up: ['A clinic room with a nurse', 'A doctor who doesn’t write anything down'], benefit: v => `hospital bills ${Math.round(v * 100)}% lower; you heal faster` },
  coffee: { name: 'Coffee shop', icon: '☕', col: '#c9a46b', perk: 'loyalty', lv: [0.1, 0.2, 0.3], inc: [1, 1.55, 2.2], up: ['Roasting on site, queues out the door', 'Three more branches and a back room for meetings'], benefit: v => `crew morale never below +${Math.round(v * 10)} (capped at ${MORALE_CAP})` },
  diner: { name: 'Diner', icon: '🍳', col: '#ffb547', perk: 'loyalty', lv: [0.15, 0.3, 0.45], inc: [1, 1.5, 2.0], up: ['Open 24 hours, booths in the back', 'A diner every cop and crook in town eats at'], benefit: v => `crew morale never below +${Math.round(v * 10)} (capped at ${MORALE_CAP})` },
  pizza: { name: 'Pizzeria', icon: '🍕', col: '#ff4d5e', perk: 'delivery', lv: [0.04, 0.08, 0.12], inc: [1, 1.5, 2.1], up: ['A delivery fleet of scooters', 'Delivery drivers who know every back street'], benefit: v => `crew deliveries ${Math.round(v * 100)}% more likely to arrive` },
  restaurant: { name: 'Restaurant', icon: '🍽', col: '#d8a227', perk: 'infl', lv: [5, 12, 22], inc: [1, 1.6, 2.4], up: ['A chef with a reputation and a wine list', 'The private dining room where deals get made'], benefit: v => `+${v} influence (people come to you)` },
  bar: { name: 'Bar', icon: '🍺', col: '#ffb547', perk: 'recruit', lv: [1, 2, 3], inc: [1, 1.5, 2.1], up: ['A pool room and a back door', 'A live music night that pulls the whole district'], benefit: v => `${v} more recruit${v > 1 ? 's' : ''} on offer` },
  nightclub: { name: 'Nightclub', icon: '🎧', col: '#e056fd', perk: 'recruit', lv: [1, 2, 3], inc: [1, 1.6, 2.4], up: ['A VIP floor and a name DJ', 'The club the city’s money parties in: recruits and influence'], benefit: v => `${v} more recruit${v > 1 ? 's' : ''}; nightlife money` },
  motel: { name: 'Motel', icon: '🛏', col: '#ff4d5e', perk: 'crewRoom', lv: [1, 2, 3], inc: [1, 1.45, 1.95], up: ['Refurbished rooms and a pool', 'Rooms by the week for your people'], benefit: v => `room for ${v} more crew` },
  hotel: { name: 'Hotel', icon: '🏨', col: '#7fb2ff', perk: 'crewRoom', lv: [2, 3, 5], inc: [1, 1.6, 2.4], up: ['A rooftop bar and a ballroom', 'A five-star flag on the door: suites for your lieutenants'], benefit: v => `room for ${v} more crew; influence` },
  pawn: { name: 'Pawn shop', icon: '💍', col: '#c9a46b', perk: 'fence', lv: [0.1, 0.2, 0.3], inc: [1, 1.5, 2.0], up: ['A back room and a jeweller’s loupe', 'Buyers in three cities: nothing stays hot for long'], benefit: v => `hot goods fence ${Math.round(v * 100)}% higher` },
  jewelry: { name: 'Jewellery store', icon: '💎', col: '#46d4c4', perk: 'fence', lv: [0.08, 0.16, 0.25], inc: [1, 1.6, 2.4], up: ['A workshop that recuts stones', 'An appraiser who never asks where it came from'], benefit: v => `premium valuables fence ${Math.round(v * 100)}% higher` },
  boutique: { name: 'Boutique', icon: '👜', col: '#d28cff', perk: 'launder', lv: [0.25, 0.45, 0.7], inc: [1, 1.55, 2.3], up: ['A second floor and a celebrity client', 'A label of your own: very clean books'], benefit: v => `launders your heat: pressure −${v.toFixed(2)} a day` },
  electronics: { name: 'Electronics store', icon: '📱', col: '#7fb2ff', perk: 'fence', lv: [0.05, 0.1, 0.15], inc: [1, 1.45, 2.0], up: ['A repair counter for phones', 'Refurbished stock shipped out of town'], benefit: v => `hot goods fence ${Math.round(v * 100)}% higher` },
  mechanic: { name: 'Mechanic', icon: '🔧', col: '#d8a227', perk: 'repair', lv: [0.15, 0.3, 0.45], inc: [1, 1.45, 2.0], up: ['A second lift and diagnostic gear', 'A race shop: tuning parts at cost'], benefit: v => `repairs and tuning ${Math.round(v * 100)}% cheaper` },
  bodyshop: { name: 'Body shop', icon: '🎨', col: '#ff8a3d', perk: 'respray', lv: [0.25, 0.45, 0.65], inc: [1, 1.5, 2.1], up: ['A spray booth and fresh plates', 'New VINs while you wait'], benefit: v => `resprays ${Math.round(v * 100)}% cheaper; repairs a little cheaper` },
  towing: { name: 'Towing company', icon: '🚚', col: '#f4c20d', perk: 'delivery', lv: [0.05, 0.1, 0.15], inc: [1, 1.45, 2.0], up: ['Two more trucks and the police contract', 'Every impound lot in the city calls you first'], benefit: v => `crew deliveries ${Math.round(v * 100)}% more likely to arrive; wrecks repaired cheaper` },
  carwash: { name: 'Car wash', icon: '🫧', col: '#46d4c4', perk: 'launder', lv: [0.3, 0.5, 0.8], inc: [1, 1.45, 2.0], up: ['A second tunnel and a detailing bay', 'Cash-only VIP valet: the cleanest dirty money in town'], benefit: v => `launders your heat: pressure −${v.toFixed(2)} a day; respray on site` },
  construction: { name: 'Construction company', icon: '🏗', col: '#d8a227', perk: 'launder', lv: [0.3, 0.55, 0.85], inc: [1, 1.6, 2.4], up: ['City contracts and a cement fleet', 'The firm that builds the new stadium stand'], benefit: v => `launders heat (−${v.toFixed(2)} a day); property repairs cheaper` },
  storage: { name: 'Storage facility', icon: '📦', col: '#c9a46b', perk: 'storage', lv: [250, 600, 1200], inc: [1, 1.35, 1.8], up: ['A new wing of lock-ups', 'Climate-controlled vaults no inspector opens'], benefit: v => `${v} units of stash space here` },
  realestate: { name: 'Real-estate office', icon: '🏘', col: '#8fe39b', perk: 'propDisc', lv: [0.04, 0.08, 0.12], inc: [1, 1.5, 2.2], up: ['Agents in every district', 'You hear about every sale before it lists'], benefit: v => `property ${Math.round(v * 100)}% cheaper to buy` },
  accounting: { name: 'Accounting office', icon: '🧾', col: '#e8eef6', perk: 'allIncome', lv: [0.04, 0.08, 0.12], inc: [1, 1.4, 1.9], up: ['A tax partner and better software', 'A partner who used to audit for the state'], benefit: v => `every business earns ${Math.round(v * 100)}% more; protection fees lower` },
  arcade: { name: 'Arcade', icon: '🕹', col: '#d28cff', perk: 'recruit', lv: [1, 1, 2], inc: [1, 1.5, 2.1], up: ['VR booths and a prize counter', 'A gaming lounge: runners who know every street'], benefit: v => `${v} more young recruit${v > 1 ? 's' : ''}; deliveries a little safer` },
  funeral: { name: 'Funeral home', icon: '⚱', col: '#9aa3b2', perk: 'heat', lv: [0.2, 0.35, 0.55], inc: [1, 1.4, 1.85], up: ['A crematorium out back', 'Paperwork nobody ever reads'], benefit: v => `police pressure fades ${v.toFixed(2)} a day faster` },
  logistics: { name: 'Freight & logistics', icon: '🚛', col: '#46d4c4', perk: 'storage', lv: [300, 700, 1300], inc: [1, 1.5, 2.2], up: ['A loading dock and two more trucks', 'Bonded storage and a customs broker'], benefit: v => `${v} units of storage; deliveries safer` },
  security: { name: 'Security firm', icon: '🛡', col: '#4d8dff', perk: 'intel', lv: [0.12, 0.22, 0.35], inc: [1, 1.5, 2.1], up: ['Patrol cars and a control room', 'Contracts with half the precinct’s families'], benefit: v => `${Math.round(v * 100)}% better chance of a raid tip-off; your places are raided less` }
};
const BIZ_LEVEL_NAME = ['Purchased', 'Improved', 'Fully developed'];
// owning many of one kind stacks, up to a point
const PERK_CAP = { legal: 0.6, repair: 0.6, respray: 0.85, fence: 0.6, propDisc: 0.25, allIncome: 0.3, medic: 0.8, intel: 0.7, delivery: 0.25, stamina: 0.6, launder: 4, heat: 2, loyalty: 3, recruit: 6, crewRoom: 20, infl: 120, storage: 1e6 };
// the 43 businesses added in v6 (the original seven keep their ids). at: kerbside door [bx, bz, side, along],
// pinned once from a layout search so they never move under someone who owns them.
const BIZ_NEW = [
  ['law_c', 'Harlan & Voss Attorneys', 'law', 'c', 120000, [7, 7, 3, 40], 'Corner-office litigators. They have never lost a client they liked.'],
  ['pharm_c', 'Harbor Pharmacy', 'pharmacy', 'c', 46000, [7, 2, 3, 40], 'A pharmacy for people who pay cash and don’t queue.'],
  ['coffee_c', 'Grind Coffee Co.', 'coffee', 'c', 24000, [5, 4, 2, 16], 'Six-dollar coffee for the towers. A gold mine with a milk steamer.'],
  ['rest_c', 'Maison Valen', 'restaurant', 'c', 110000, [8, 6, 1, 16], 'White tablecloths, a six-month waiting list and a table that is always free for you.'],
  ['hotel', 'The Grand Valen Hotel', 'hotel', 'c', 260000, [4, 5, 2, 56], 'Marble lobby, two hundred rooms, a concierge who forgets faces.'],
  ['jewel', 'Aurum Jewellers', 'jewelry', 'c', 150000, [5, 7, 3, 16], 'Diamonds by appointment. The safe in the back is bigger than the shop.'],
  ['realty', 'Valen Realty Group', 'realestate', 'c', 85000, [6, 3, 0, 40], 'Every lease in the Financial District crosses this desk.'],
  ['accts', 'Ledgerline Accounting', 'accounting', 'c', 70000, [7, 5, 0, 24], 'Numbers that add up exactly how you need them to.'],
  ['law_m', 'Mercer Legal Aid', 'law', 'm', 38000, [8, 0, 0, 64], 'Downtown legal aid with a waiting room full of your kind of people.'],
  ['salon', 'Velvet Hair Studio', 'salon', 'm', 26000, [7, 0, 0, 32], 'Everyone downtown tells their stylist everything.'],
  ['gym_m', 'Iron Works Gym', 'gym', 'm', 42000, [9, 3, 1, 24], 'Chalk, sweat and a heavy bag nobody touches.'],
  ['grocery', 'Valen Fresh Grocery', 'grocery', 'm', 52000, [9, 5, 1, 32], 'Fruit, bread, and a stockroom with a lock nobody else has.'],
  ['electro', 'Voltline Electronics', 'electronics', 'm', 58000, [5, 2, 0, 16], 'Phones, laptops and a repair counter that wipes anything.'],
  ['security', 'Sentinel Security', 'security', 'm', 95000, [3, 4, 3, 64], 'Alarm contracts, patrol cars and a list of who is away on holiday.'],
  ['store_s', 'Lockbox Self Storage', 'storage', 'm', 36000, [8, 0, 3, 32], 'Four floors of lock-ups. The manager doesn’t keep keys.'],
  ['logi_s', 'City Courier Depot', 'logistics', 'm', 64000, [8, 1, 1, 16], 'Vans, bikes and a sorting floor that never closes.'],
  ['laund_o', 'Spin City Laundromat', 'laundromat', 'o', 16000, [3, 1, 1, 64], 'Thirty machines and a till that takes more than coins.'],
  ['barber', 'Sal’s Barbershop', 'barber', 'o', 15000, [3, 0, 1, 16], 'Three chairs, forty years, every secret in the Old Quarter.'],
  ['coffee_o', 'Brick Lane Espresso', 'coffee', 'o', 19000, [0, 4, 3, 16], 'An espresso bar where the old men play cards all afternoon.'],
  ['pizza', 'Tony’s Pizzeria', 'pizza', 'o', 22000, [2, 9, 1, 16], 'Wood-fired since 1961. The delivery boys go everywhere.'],
  ['funeral', 'Morrow & Sons Funeral Home', 'funeral', 'o', 54000, [0, 6, 3, 64], 'Discreet arrangements. Very discreet.'],
  ['laund_l', 'Bubbles Wash & Fold', 'laundromat', 'l', 21000, [0, 9, 2, 48], 'A suburban laundromat with very clean machines and very clean books.'],
  ['conv_l', 'Linden Corner Mart', 'convenience', 'l', 14000, [2, 9, 3, 60], 'Milk, smokes and scratch cards for the cul-de-sacs.'],
  ['pharm_l', 'Linden Chemist', 'pharmacy', 'l', 28000, [2, 9, 3, 28], 'The pharmacist knows every family on the hill.'],
  ['wash2', 'Shine Express Car Wash', 'carwash', 'l', 30000, [0, 10, 3, 24], 'A drive-through tunnel and a cash box that fills itself.'],
  ['tattoo', 'Black Lotus Tattoo', 'tattoo', 'p', 21000, [4, 11, 3, 16], 'Ink for the Strip. Half the crews in town wear their work.'],
  ['rest_p', 'The Saffron Room', 'restaurant', 'p', 62000, [5, 11, 1, 16], 'Late-night dining on the Strip. The booths are wired for nothing.'],
  ['bar_p', 'The Velvet Lamp', 'bar', 'p', 36000, [4, 9, 3, 48], 'A cocktail bar with red lights and a back door to the alley.'],
  ['pulse', 'Pulse', 'nightclub', 'p', 140000, [6, 9, 1, 56], 'The other big room on the Strip. Bigger sound, younger crowd.'],
  ['threads', 'Strip Threads', 'boutique', 'p', 34000, [4, 8, 1, 40], 'Club clothes, sunglasses at night and a till that loves cash.'],
  ['arcade', 'Pixel Palace Arcade', 'arcade', 'p', 27000, [5, 8, 0, 64], 'Neon cabinets and kids who know every shortcut in town.'],
  ['conv_s', 'Night Owl Mini-Mart', 'convenience', 's', 12000, [10, 1, 0, 16], 'The only lights on the Belt after midnight.'],
  ['diner_s', 'Route 9 Diner', 'diner', 's', 20000, [11, 5, 0, 56], 'Truckers, night shifts and racers eat here.'],
  ['pawn_s', 'Second Chance Pawn', 'pawn', 's', 26000, [10, 1, 0, 40], 'A pawn shop on the Belt that buys what Lucky won’t.'],
  ['mech', 'Gearhead Garage', 'mechanic', 's', 44000, [10, 1, 3, 48], 'Two lifts, a dyno and a mechanic who used to build race cars.'],
  ['body', 'Precision Body & Paint', 'bodyshop', 'w', 40000, [9, 10, 0, 40], 'Dents out, new paint, no questions.'],
  ['tow', 'Hook & Haul Towing', 'towing', 'w', 33000, [6, 11, 3, 40], 'Four tow trucks and the impound contract.'],
  ['build', 'Ironside Construction', 'construction', 'w', 135000, [7, 11, 3, 40], 'Cranes, concrete and city contracts nobody else bid on.'],
  ['gym_h', 'Dockside Boxing Club', 'gym', 'h', 25000, [11, 8, 3, 64], 'A ring under a crane. The dock crews train here.'],
  ['pub_h', 'Harbour Lights Pub', 'bar', 'h', 28000, [10, 8, 0, 40], 'Dock workers, sailors and anyone who needs a job tonight.'],
  ['motel_h', 'Seaview Motor Inn', 'motel', 'h', 38000, [11, 8, 0, 64], 'Rooms that face the containers, rented by the night or the month.'],
  ['store_h', 'SafeKeep Storage', 'storage', 'h', 30000, [11, 8, 0, 40], 'Shipping containers turned lock-ups, right on the quay.'],
  ['logi_h', 'Tidewater Freight', 'logistics', 'h', 90000, [11, 8, 3, 40], 'A freight forwarder with its own crane and its own customs man.']
];
// the original seven join the categories (their old flags stay)
const BIZ_CAT_OF = { pawn: 'pawn', bar: 'bar', diner: 'diner', carwash: 'carwash', motel: 'motel', club: 'nightclub', boutique: 'boutique' };
for (const [id, name, cat, zone, price, at, desc] of BIZ_NEW) {
  const C2 = BIZ_CATS[cat];
  const def = { id, name, kind: 'business', cat, price, at, income: Math.round(price * (C2.perk === 'storage' ? 0.02 : 0.024) / 10) * 10, storage: C2.perk === 'storage' ? C2.lv[0] : Math.round(20 + price / 3000), crew: C2.perk === 'crewRoom' ? 0 : 1, desc, zoneHint: zone };
  if (cat === 'pawn') def.fence = true;
  if (C2.perk === 'launder') def.launder = true;
  if (cat === 'carwash' || cat === 'bodyshop') def.respray = true;
  if (C2.perk === 'recruit') def.recruit = true;
  if (cat === 'nightclub' || cat === 'motel' || cat === 'hotel' || cat === 'bar') def.night = true;
  if (cat === 'hotel' || cat === 'restaurant' || cat === 'jewelry') def.infl = cat === 'hotel' ? 25 : 10;
  PROPS.push(def); PROP_BY_ID[id] = def;
}
for (const id in BIZ_CAT_OF) if (PROP_BY_ID[id]) PROP_BY_ID[id].cat = BIZ_CAT_OF[id];
const BIZ_IDS = PROPS.filter(p => p.kind === 'business').map(p => p.id);
// upgrade prices: level 2 costs 90% of the purchase price, level 3 twice it again
// an upgrade pays for itself in about 50 (to level 2) and 80 (to level 3) economic days at the ordinary rate (M13; it
// was 70 and 150, so nobody developed a business)
function bizUpgradeCost(def, lvl) { return lvl === 1 ? Math.round(def.price * 0.6 / 500) * 500 : lvl === 2 ? Math.round(def.price * 1.2 / 500) * 500 : 0; }
// daily running costs (staff, rent, stock) at each level, as a share of the base income
const BIZ_UPKEEP = [0.18, 0.24, 0.3];
// §45.7: buying a business buys no influence. It starts to count after BIZ_EST_DAYS world days of operation and
// reaches its full weight (BIZ_INFL plus its own prestige, def.infl) over the next BIZ_EST_RAMP days
const BIZ_INFL = 15, BIZ_EST_DAYS = 7, BIZ_EST_RAMP = 14;
// the empire while you are in jail (M13, §45.8): every day inside is a full economic day out there (1:1 calendar),
// but a boss in a cell earns no profit from it, so a sentence is never a way to fast-forward income. A managed
// business (or the motorsport park) covers its own costs and stays strong; an unmanaged one takes in only half its
// costs and slides. A dealer hands over `dealLt` of the takings where a Lieutenant runs the district, `deal`
// elsewhere (the rest walks); territory tax comes in at `royLt` only where a Lieutenant collects it. Wages and
// upkeep are due in full; fronts keep washing (a conversion, not a profit).
const JAIL_OPS = { unmanaged: 0.5, deal: 0.3, dealLt: 0.55, royLt: 0.3 };
// owned property on a turf is local presence (§45.23): showdown strength 6 for one, diminishing to at most 12 however
// many you own there, and your hold fades at PROP_PRESENCE_DECAY of the rate it would without anyone on the ground
const PROP_PRESENCE = 6, PROP_PRESENCE_MAX = 12, PROP_PRESENCE_DECAY = 0.5;
// ---- warehouses (§5-§8, Session 3): the empire's hub. 15 crew slots (up to 10 Enforcers, 4 Drivers, 1 Lieutenant);
// four security categories, each bought up through four tiers; the warehouse's security level (1-5) is 1 + its
// weakest category, so a level means every part of it is that good. The vault and interior tier sets how much Dirty
// Cash the vault holds and how much product the floor takes.
const WH_SLOTS = 15, WH_MAX = { enforcer: 10, driver: 4, lieutenant: 1 };
const WH_CATS = {
  perimeter: { name: 'Perimeter', tiers: ['Open lot', 'Chain-link fence', 'Tall fence and bollards', 'Anti-climb fencing and anti-ram barriers', 'Hardened wall-and-fence perimeter'] },
  surveillance: { name: 'Surveillance', tiers: ['Weak lighting', 'Cameras and stronger lights', 'More cameras and floodlights', 'Dense cameras and a security room', 'Full coverage and a command room'] },
  access: { name: 'Access control', tiers: ['Plain roll-up door', 'Basic gate', 'Motorised gate, controlled loading', 'Reinforced powered gate and guard booth', 'Massive gate, access posts, protected approach'] },
  vault: { name: 'Vault and interior', tiers: ['Exposed storage', 'Lockable cages and a small safe', 'Product cage and a cash room', 'Proper vault, hardened storage, armory', 'Large vault, product vaults, ready room'] }
};
const WH_CAT_IDS = Object.keys(WH_CATS);
const WH_TIER_COST = [0.15, 0.3, 0.6, 1.2]; // tier 1-4 price, × the warehouse's price, paid from Clean Bank
const WH_LEVEL_NAME = ['Basic', 'Reinforced', 'Secured', 'Fortified', 'Maximum Security'];
const WH_VAULT = [100000, 500000, 2500000, 10000000, 50000000]; // Dirty Cash the vault holds, by vault tier
const WH_STORE_MUL = [1, 1.25, 1.5, 1.75, 2];                     // product storage, by vault tier
// §6: at Maximum Security with at least 4 Enforcers and a Lieutenant, ordinary rival raids can't knock it off
const WH_IMMUNE = { level: 5, enforcers: 4, lieutenants: 1 };
// Session 3B: what each tier physically builds (CompoundSystem). ram: the impact speed (m/s) a car needs to break
// through; Infinity holds against any car. Fences and gates below the anti-ram tiers can be rammed open.
const WH_FENCE = [null,
  { kind: 'chain', h: 2.2, ram: 7 },
  { kind: 'tall', h: 3.2, ram: 11, bollards: true },
  { kind: 'anticlimb', h: 3.6, ram: Infinity, barriers: true },
  { kind: 'wall', h: 4.4, wall: 2.6, ram: Infinity, barriers: true }];
const WH_GATE = [null,
  { kind: 'basic', h: 2.2, open: 2.4, ram: 7 },
  { kind: 'motor', h: 2.6, open: 1.4, ram: 12, controlled: true },
  { kind: 'reinforced', h: 3.0, open: 1.6, ram: Infinity, controlled: true, booth: true },
  { kind: 'massive', h: 3.8, open: 1.8, ram: Infinity, controlled: true, booth: true, posts: true, wedge: true }];
// cameras by surveillance tier; light is the share of a camera's range it keeps at night under that tier's lighting
// breaches (§45.26): crew assigned to the warehouse patch after patchH economic hours and repair after repairH;
// a patch holds against anything slower than patchRam. Costs: a flat patch, a repair at the warehouse price × rate
// × the tier being restored; contractors (from the bank, today) charge `contractor` × the repair
const WH_BREACH = { patchH: 1, repairH: 8, patchRam: 6, patchPanel: 150, patchGate: 400, repairPanel: 0.002, repairGate: 0.012, contractor: 1.5 };
// Session 4A (§10, §45.10, §45.16): gang pressure and threats. Pressure (0-100 per faction) comes only from what the
// player does to that faction; it decays each day. Stages: intimidation, hits on assets, coordinated strikes.
const PRESSURE = { take: 30, ko: 2, down: 0.5, boss: 25, ship: 30, deal: 1, held: -12, decay: 0.85, decayFlat: 2 };
const PRESS_STAGE = { warn: 20, hit: 40, strike: 70 };
// the real-time threat clock (seconds of active play): the warning to THREAT IMMINENT, then to execution; a physical
// assault lasts at most `fight` seconds before it is decided by what is left standing
const THREAT_T = { warn: 120, imminent: 60, fight: 120, near: 140 };
// Session 4B: each faction keeps a physical warehouse (block, its security tiers, what it can hold). Tiers stay at
// or below 2 in perimeter and access, so there is always a way in for a determined player (a car through the gate
// or the fence); the stronger crews watch more and keep more.
const RIVAL_WH = {
  // Vipers keep theirs at the north end of the Old Quarter, 500 m from where a new career starts (DC-34 ruling)
  vipers: { at: [5, 0], name: 'Vipers stash yard', up: { perimeter: 1, surveillance: 1, access: 1, vault: 1 }, cap: 120, cash: 30000 },
  velvet: { at: [6, 10], name: 'Velvet bonded store', up: { perimeter: 2, surveillance: 2, access: 1, vault: 1 }, cap: 140, cash: 45000 },
  glasshouse: { at: [9, 4], name: 'Glasshouse depot', up: { perimeter: 1, surveillance: 2, access: 2, vault: 2 }, cap: 160, cash: 60000 },
  bellcourt: { at: [9, 1], name: 'Bellcourt warehouse', up: { perimeter: 2, surveillance: 2, access: 2, vault: 2 }, cap: 180, cash: 80000 },
  tidewater: { at: [11, 9], name: 'Tidewater freight shed', up: { perimeter: 2, surveillance: 3, access: 2, vault: 2 }, cap: 220, cash: 100000 }
};
// their blocks are landmarks laid out by World._genRivalWh (before the world is generated: this file loads first)
for (const fid in RIVAL_WH) LANDMARK_BLOCKS[RIVAL_WH[fid].at.join(',')] = { gen: '_genRivalWh', name: RIVAL_WH[fid].name, icon: 'W', ground: 'I', rival: fid };
// the police impound lot (Session 5B, §14, §45.30): a fenced yard with a motorised gate and cameras, near the
// precinct. fee: the Clean Bank release fee, a share of the car's value within [min, max]; stars: the heat of
// getting a car out without paying (picking the gate, ramming it, driving out unpaid)
// the stars a theft off a dealer's lot starts at (§13): the cash lot, the licensed dealer, the prestige showroom
const DEALER_THEFT = { used: 1, new: 3, lux: 5 };
const IMPOUND = { id: 'impound', at: [4, 7], name: 'Port Valen Police Impound', tiers: { perimeter: 2, surveillance: 2, access: 2, vault: 0 },
  fee: { min: 300, k: 0.06, max: 25000 }, pick: 8, open: 12, stars: { pick: 2, ram: 3, drive: 2, seen: 2 }, office: 3.5,
  // the overflow yard next door: when the main yard's spaces are taken, seized cars go to their own numbered space
  // there. Between the two there is a space for every car you could ever own (tests/hot.mjs checks it)
  overflow: { id: 'impound_x', at: [4, 8], name: 'Police Impound · overflow yard' },
  // Valen Point's annex (Session 6B): the pit garages add parking past what the two city yards hold, so a third
  // yard by the causeway landing keeps a space for every car you could own
  annex: { id: 'impound_vp', name: 'Police Impound · Valen Point annex', sign: 'ANNEX' } };
// the overflow yard's spaces (yard-local metres: u across the gate fence, v in from it). Bays fit the biggest vehicle;
// rows face aisles of 6.6 m or more (v 1–8.1 along the gate fence, 22.9–29.5, 44.3–50.9) joined by a lane at u −29…−22
const OVERFLOW_BAY = { w: 2.9, d: 7.4, n: 17, u0: -19.7 };
const OVERFLOW_ROWS = [[11.8, -1], [19.2, 1], [33.2, -1], [40.6, 1], [54.6, -1]];
LANDMARK_BLOCKS[IMPOUND.at.join(',')] = { gen: '_genImpound', name: IMPOUND.name, icon: 'P', ground: 'I', impound: true };
LANDMARK_BLOCKS[IMPOUND.overflow.at.join(',')] = { gen: '_genImpoundOverflow', name: IMPOUND.overflow.name, icon: 'P', ground: 'I', impound: true };
const WH_SURV = [{ cams: 0, range: 0, light: 0.35 }, { cams: 2, range: 18, light: 0.6 }, { cams: 4, range: 22, light: 0.75 }, { cams: 6, range: 26, light: 0.9 }, { cams: 10, range: 32, light: 1 }];
// a dealer's stock on the corner (units), filled by hand or by a Driver; automation keeps it at the target
const TURF_STOCK_CAP = 60, TURF_STOCK_TARGET = 40;
// a warehouse with a Lieutenant reorders from a supplier when its sellable stock falls below this much space, a lot at a time
const WH_REORDER = 60, WH_REORDER_LOT = 80;
// route risk (§8): chance of a rival hijack for each stretch of the route, by who holds the turf; police risk is
// separate (pressure and patrols)
const ROUTE_RISK = { own: 0.002, friendly: 0.01, neutral: 0.03, rival: 0.07, hostile: 0.12 };
// ---- v6: neighbourhoods give a home a little extra (stash safety, standing, recruiting) on top of the house itself
const HOOD = {
  l: { name: 'Linden Hills', perk: 'Quiet streets: stashes here are raided 30% less', raid: 0.7 },
  u: { name: 'Crestmoor Heights', perk: 'Gated and lawyered: raids 50% less', raid: 0.5 },
  r: { name: 'Cedar Fields', perk: 'Nobody out here: raids 60% less', raid: 0.4 },
  o: { name: 'Old Quarter', perk: '', raid: 1.0 },
  c: { name: 'Financial District', perk: 'Prestige address: stashes raided 15% less', raid: 0.85 },
  m: { name: 'Downtown', perk: 'Central: crew deliveries from here are safer', raid: 0.95 },
  h: { name: 'Docklands', perk: 'Close to the boats: stashes hold 25% more', raid: 1.15, store: 1.25 },
  p: { name: 'Nightlife Strip', perk: 'The scene: one more recruit on offer', raid: 1.05, recruit: 1 }
};
// security of a home by tier (1 basic lock … 5 gated with cameras); a signature home is one better
const HOME_SEC = [1, 1, 2, 3, 4, 5, 5];
const HOME_FINISH = ['', 'Basic', 'Standard', 'Good', 'Premium', 'Luxury', 'Estate'];
// street-level contacts: suppliers, buyers, the armorer
// a supplier's shelf restocks half a full delivery each economic day (M13: shelves never refilled before, so a bought-out
// supplier stayed empty for good)
const SUPPLY_RESTOCK = 0.5;
const SPOTS = [
  { id: 'sully', name: 'Dockside Sully', role: 'Supplier · smokes & hot goods', at: [10, 8, 3, 50], sells: ['smokes'], buysHot: false, rep: 0, col: 0x46d4c4 },
  { id: 'gus', name: 'Greenhouse Gus', role: 'Supplier · green', at: [1, 1, 1, 30], sells: ['green'], rep: 100, col: 0x7fe08f },
  { id: 'feld', name: 'Doc Feld', role: 'Supplier · pharma', at: [4, 4, 2, 50], sells: ['pills'], rep: 300, col: 0xffd84d },
  { id: 'armorer', name: 'The Armorer', role: 'Weapons · buys hardware', at: [8, 11, 0, 30], arms: true, rep: 0, col: 0xff8a3d },
  { id: 'chop', name: 'Saltworks Chop Shop', role: 'Buys stolen cars', place: 'chopshop', chop: true, col: 0xc9a46b },
  { id: 'fixer', name: 'Dina Vance', role: 'Laundering fixer · Dirty Cash in, Clean Bank out', at: [3, 1, 3, 30], fixer: true, rep: 0, col: 0x8fe39b }
];
// the early laundering fixer (§45.6, §45.22): she takes Dirty Cash you hand her in person and puts it in your bank
// FIXER_DELAY economic hours later, minus FIXER_FEE, at most FIXER_DAY_CAP a day. Time runs on the economic clock
// (Underworld.econH), so the day-length setting doesn't change how much she washes per hour of play (§45.9).
// Fronts (Session 9) supersede her.
const FIXER_FEE = 0.32, FIXER_DAY_CAP = 5000, FIXER_DELAY = 12, FIXER_MIN = 100;
// the economic clock runs at the reference day length outside jail, and at world time in jail (1:1, §45.8)
const ECON_REF_DAY = 30;
// faction headquarters (the boss and guards stand here)
const HQS = { vipers: [1, 6, 1, 40], tidewater: [11, 7, 3, 40], velvet: [6, 9, 0, 30], bellcourt: [8, 1, 3, 40], glasshouse: [7, 6, 1, 40] };
// chop shop prices per class (before condition and the wanted list)
const CHOP_VALUE = { compact: 260, sedan: 420, taxi: 300, van: 480, pickup: 520, suv: 720, sports: 1700, muscle: 1900, classic: 2700, coupe: 2500, supercar: 4800, offroad: 1500, luxury: 2400, gangcar: 950, utility: 460, truck: 760,
  metro: 220, regent: 340, estate: 460, courier: 440, crest: 600, apex: 1400, hellion: 2300, tempest: 2000, revenant: 3000, kodiak: 3200, monarch: 3800, valkyr: 5600, obsidian: 6200 };
const CREW_ROLES = {
  idle: { name: 'Unassigned', desc: 'Waiting for orders. Still on the payroll.' },
  dealer: { name: 'Dealer', desc: 'Sells product on a turf every day from the stock on the corner, which you or a Driver bring. Raises local heat.', turf: true },
  enforcer: { name: 'Enforcer', desc: 'Holds a turf (grows your influence, defends it from rivals) or guards a warehouse.', turf: true, wh: true },
  lieutenant: { name: 'Lieutenant', desc: 'Runs a warehouse and every turf you hold in its district (or a district on its own): automates supply runs and coordinates defense. Needs Captain rank. Gains power over time.', zone: true, wh: true, minRank: 3 },
  bodyguard: { name: 'Bodyguard', desc: 'Follows you and fights for you. Two at most.', max: 2 },
  manager: { name: 'Business manager', desc: 'Runs one of your businesses: more income, less suspicion.', biz: true },
  scout: { name: 'Scout', desc: 'Watches a district: warns of raids and reports rival moves.', zone: true },
  driver: { name: 'Driver', desc: 'Logistics, based at a warehouse: runs product from suppliers to the warehouse and from the warehouse to your Dealers. Only Drivers make deliveries.', wh: true }
};
const CREW_RANKS = ['Associate', 'Crew Member', 'Enforcer', 'Captain', 'Lieutenant'];
const PROMO_COST = [0, 1500, 4000, 10000, 25000];
// money and crew loyalty (§45.23): money buys morale, which is temporary and capped, and never makes anyone
// betrayal-proof. Wages paid on time stop loyalty decaying; a bonus adds morale (less for each recent one); a raise
// adds a little lasting loyalty, at most RAISE_LOYALTY_CAP over a career. Disloyalty reads loyalty + morale.
const MORALE_CAP = 10, MORALE_DECAY = 1.5, BONUS_MORALE = 8, BOOST_FADE = 0.85, RAISE_LOYALTY = 5, RAISE_LOYALTY_CAP = 10;
const TRAITS = {
  loyal: { name: 'Loyal', desc: 'Slow to turn, whatever happens.' },
  greedy: { name: 'Greedy', desc: 'Wants more money. Skims when unhappy.' },
  hothead: { name: 'Hothead', desc: 'Fights well, starts trouble, heat follows.' },
  cautious: { name: 'Cautious', desc: 'Rarely caught. Rarely brilliant.' },
  ambitious: { name: 'Ambitious', desc: 'Gains power fast. Watch them.' },
  veteran: { name: 'Veteran', desc: 'Done this before. Higher skill.' },
  talker: { name: 'Loose lips', desc: 'Talks when drunk. Leaks when disloyal.' }
};
const FIRST_NAMES = ['Rico', 'Tasha', 'Dre', 'Mika', 'Lou', 'Benny', 'Carmen', 'Jax', 'Nadia', 'Sol', 'Tommy', 'Imani', 'Viktor', 'Reggie', 'Paz', 'Hollis', 'Dee', 'Kenji', 'Ruby', 'Marco', 'Aisha', 'Cyrus', 'Lena', 'Ozzie', 'Faye', 'Dom', 'Priya', 'Gus', 'Sasha', 'Theo', 'Yara', 'Kofi', 'Bianca', 'Wes'];
const LAST_NAMES = ['Moreno', 'Kowalski', 'Achebe', 'Lindqvist', 'Navarro', 'Doyle', 'Park', 'Osei', 'Ferreira', 'Brandt', 'Quinn', 'Vasquez', 'Mbeki', 'Romano', 'Haddad', 'Novak', 'Reyes', 'Tran', 'Kaplan', 'Stone', 'Okafor', 'Duarte', 'Ivanova', 'Marsh'];
const NICKS = ['Smiles', 'Wheels', 'Two-Tone', 'Bricks', 'Ghost', 'Lucky', 'Professor', 'Tiny', 'Saint', 'Spider', 'Ice', 'Hammer'];
// police contacts. honest officers cannot be bought (and remember you tried)
const OFFICERS = [
  { id: 'kerr', name: 'Ofc. Dale Kerr', rank: 'Patrol, Old Quarter', minRank: 1, fee: 1500, zone: 'o', honest: 0.1, perks: 'Tip-offs before raids on your stashes. Heat in the Old Quarter fades faster.' },
  { id: 'park', name: 'Ofc. Nina Park', rank: 'Patrol, Docklands', minRank: 1, fee: 1800, zone: 'h', honest: 0.25, perks: 'Docklands patrols arrive late. Warns you about port surveillance.' },
  { id: 'okoro', name: 'Det. Sam Okoro', rank: 'Narcotics', minRank: 2, fee: 5000, honest: 0.3, perks: 'Evidence goes missing: sentences 15% shorter, better odds with the guards. Leaks upcoming raids on rivals.' },
  { id: 'moss', name: 'Sgt. Lena Moss', rank: 'Desk sergeant, Police HQ', minRank: 2, fee: 6000, honest: 1, perks: 'Straight as an arrow. Trying to buy her is a mistake.' },
  { id: 'pike', name: 'Lt. Harlan Pike', rank: 'Watch commander', minRank: 3, fee: 12000, honest: 0.35, perks: 'Slower dispatch at low wanted levels, faster escapes, and he can point a raid at a rival (every 3 days).' },
  { id: 'lindqvist', name: 'Det. Rae Lindqvist', rank: 'Internal Affairs', minRank: 3, fee: 20000, honest: 1, perks: 'Investigates dirty cops. Cannot be bought.' },
  { id: 'bramford', name: 'Capt. Wes Bramford', rank: 'Precinct captain', minRank: 4, fee: 25000, honest: 0.4, perks: 'Selective enforcement: fewer patrols in your turfs, police pressure decays faster.' },
  { id: 'vale', name: 'Deputy Chief Corinne Vale', rank: 'Headquarters', minRank: 5, fee: 50000, honest: 0.5, perks: 'Halves the pressure your turfs generate and takes 30% off every sentence.' }
];
const OFFICER_BY_ID = Object.fromEntries(OFFICERS.map(o => [o.id, o]));
const CRIME_PRESSURE = { hitped: 2, assault: 1.2, shoot: 1.5, carjack: 1.6, stealcop: 5, ramcop: 2.5, hitcop: 4, shootcop: 6, copcar: 7, explosion: 3, koped: 2.5, theft: 0.8, deal: 1.5, pickpocket: 0.6 };
function turfAt(x, z) {
  const bx = clamp(Math.floor(x / P), 0, N - 1), bz = clamp(Math.floor(z / P), 0, N - 1);
  return Math.floor(bz / 2) * TURF_N + Math.floor(bx / 2);
}
// a sidewalk spot in front of a block face: side 0 N, 1 E, 2 S, 3 W; facing the street
function sidewalkSpot(bx, bz, side, along, o = ROAD_HALF + 2.4) {
  const L = P - 2 * o, x0 = bx * P + o, z0 = bz * P + o, u = clamp(along - o, 2, L - 2);
  switch (side) {
    case 0: return { x: x0 + u, z: z0, h: Math.PI };
    case 1: return { x: x0 + L, z: z0 + u, h: Math.PI / 2 };
    case 2: return { x: x0 + L - u, z: z0 + L, h: 0 };
    default: return { x: x0, z: z0 + L - u, h: -Math.PI / 2 };
  }
}
function fmtDays(d) { return fmtSentence(d); }
function factionLook(fid, rng = Math.random) {
  const F = FACTIONS[fid], m = F.member, L = randomLook(rng);
  const p = a => Array.isArray(a) ? a[Math.floor(rng() * a.length)] : a;
  L.shirt = C(p(m.shirt)); L.pants = C(p(m.pants)); L.skirt = null;
  L.jacket = m.jacket !== undefined ? C(m.jacket) : (rng() < 0.4 ? C(p(JACKETS)) : null);
  L.bandana = m.bandana !== undefined ? C(m.bandana) : null;
  L.cap = m.cap !== undefined && rng() < 0.6 ? C(m.cap) : null;
  L.shades = !!m.shades && rng() < 0.7; L.tie = m.tie !== undefined ? C(m.tie) : null;
  L.chain = fid === 'vipers' && rng() < 0.4 ? C(0xd8b04a) : null;
  L.build = 1.0 + rng() * 0.25; L.shoulders = 1.05;
  return L;
}
function lookFrom(o, rng = Math.random) {
  const L = randomLook(rng);
  for (const k in o) {
    const v = o[k];
    if (k === 'fem') continue;
    L[k] = (typeof v === 'number' && !['build', 'hairStyle', 'scale', 'shoulders', 'hips', 'height'].includes(k)) ? C(v) : v;
  }
  if (o.fem) { L.hips = 1.1; L.shoulders = 0.9; }
  return L;
}

