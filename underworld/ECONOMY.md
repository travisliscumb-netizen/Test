# ECONOMY — the M13 balance pass (sources, sinks, Ranks, measurements)

Every number here comes from the build: `tools/econ-probe.mjs` (prices, loot tables, payout rules and a daily
simulation run through the game's own functions; output `.runs/econ.json`) and the `economy` suite (the
invariants, asserted on every regression). Hourly figures are **economic** hours turned into play time. Where a
figure depends on how fast a player acts, the assumed pace is stated next to it.

**Clock.** One economic day is 30 minutes of play, whatever the visual day length (`ECON_REF_DAY`, §45.9). The
daily economy (businesses, wages, royalties, dealers, fronts, suppliers, the progressive) turns every 24 economic
hours (`econDays`, M13), not at the visual midnight. So **income per economic day × 2 = income per hour of play.**
Sleep passes the night but not the economy. A jail day is a full economic day, at 2 real seconds each.

## 1. Rulings this pass works under (§45.40)
- An honest casino: a house edge on every game, no player-favoured tuning, and the 60/40 tuning is never restored.
- Royale Billions stays, on probation as part of the economy. The billion progressive is not removed for being an
  outlier: it is meant to be rare and life-changing.
- No fast-skipping a cab trip with product on you. A lockpick set is needed for every burglary.
- Money buys no Rank, Rep, turf, loyalty, influence or Kingpin status. Crew wages are Dirty Cash only, with no
  fallback to Clean Bank.
- A car resells for at most 85% of everything put into it, with no arbitrage. One-off cars can't be sold. The
  rooftop Zephyr is a one-time car.
- Illegal races pay Dirty Cash and Rep. Official events pay Clean Bank and no Rep.
- Jail never accelerates passive income.

## 2. Sources of wealth

| Source | Currency → where | Gate | Repeat / cooldown | Risk | Measured EV (per action) | Rep | Jail effect |
|---|---|---|---|---|---|---|---|
| Pickpocket | Dirty → on you | none | per pedestrian; district wariness +0.15 a lift, fades 0.1 per econ hour (~12.5 min to clear); the rich districts +0.3, fade 0.06 (~21 min) | a failed lift is a crime (witness → police) | per lift on a fresh district: mean $217 city-wide; $53 (Warehouse District 03:00) … $1,132 (Crestmoor Heights 22:00), Financial District noon $963. **Per hour** (seeded, a lift every 20 s, a failure costs 45 s, 4 lifts then 90 s to the next district): circling the rich districts ≈ $6.6k, ordinary districts ≈ $5.0k | 5 per 5 lifts | none |
| Gang drops | Dirty + product | a fight | per gang member | combat, heat | small | 4–8 a body | none |
| Glovebox / pickups / packages | Dirty | none | a package pays once ($250) | none | small | — | none |
| Burglary | Dirty + goods | a $75 lockpick per job | per house | 18% report roll on entry | T2 $178, T3 $793, T4 $803, T5 $5,284 | — | picks confiscated |
| Business robbery | Dirty + goods | robbable trades (27 shops) | security +1 per robbery, −1 per 5 econ days | police, owner lockout | shop $2.0k, food $1.6k, bar $2.6k, pharmacy $3.7k, electronics $3.5k, boutique $3.5k, pawn $4.3k, jewellery $7.8k | — | — |
| Chop shop | Dirty | a car | wanted list refreshes every 2 days (×1.6) | HOT car | compact $260 … supercar $4,800 (wanted $7,680) | 10 (25 wanted) | — |
| Street product | Dirty | supplier Rep gates (0/100/300) | street quotas per turf per day; prices fall as you sell | police, rival turf | street ÷ wholesale 1.9–2.2× | n × (tier+1) × 0.8 per sale | — |
| Fence (hot goods) | Dirty | none | price falls as you sell | none ("never calls the police") | 0.85× street (1.0× if you own the pawn shop) | up to 20 a sale | — |
| Arms (hardware → Armorer) | Dirty | Tidewater wholesale (300 Rep), boats, raids | faction stock | heat 2.2 a unit | about 0.9× street − Tidewater wholesale | 4 a unit | — |
| Street races | Dirty + Rep | a car, buy-in about 15% of the purse | 100 / 50 / 25 / 25% for repeat wins in one econ day | heat, pink slips | purse $1.2k–$2.3k | 40–55 | — |
| Contracts / story | Dirty | contacts | per job | job-specific | job-specific | job rep (replays 20%) | — |
| Dealers (crew) | Dirty → stash | crew, turf, stock | daily | raids, betrayal | two dealers on 60 green: +$992/day net of wages | — | ×0.3 (×0.55 with a Lieutenant running the district) |
| Territory royalties | Dirty → stash | turf held | daily | refusal at < 600 influence | $180–$950 a turf a day (6-turf median $330) | — | only districts with a Lieutenant pay, at ×0.3 |
| Tribute | Dirty → stash | power ratio > 2 | daily | war | faction-dependent | — | — |
| Businesses | Clean → bank | Clean price | daily | raids, protection | payback 40–49 econ days (median 41 ≈ 20 h of play); upgrades pay back in 47 / 83 days | none (§45.7) | managed: covers upkeep only; unmanaged: half of upkeep; no profit |
| Valen Point park | Clean | $1.5M | daily + hosting | — | about 81 days' payback with hosting | none | upkeep only |
| Official events (Valen Point / Cedar Fields) | Clean | fee | same 100/50/25 tiers | crash | Club $200→$2k, GT $1k→$6k, Supercar $3k→$15k; Trail Cup $200→$1.6k, Truck Run $250→$1.8k, Mesa Pro $800→$5k | **none** | — |
| Stunts | Clean | — | $1,500 a day cap; milestones once | — | — | — | — |
| Car sales | Clean / Dirty in proportion to what paid for the car | owned car | — | — | ≤ 85% of price + parts | — | — |
| Casino | Clean only | Clean stake | — | the house edge | RTP 90–99% (§5) | none | — |
| Laundering | Dirty → Clean | fixer / owned front | daily caps | raid takes half a front's float | fee 32% → 5% (§6) | none | managed fronts keep washing from stashes |

There is **no Clean → Dirty route**: no source pays Dirty for Clean, so casino winnings, business income and race
purses can't pay crew wages.

## 3. Sinks
- **Clean:** property and businesses ($2.5k–$380k safehouses, $12k–$260k businesses, two warehouses $32k / $48k,
  Valen Point $1.5M, the off-road park $180k); business upgrades (0.6× and 1.2× of the price, M13); upkeep (18/24/30%
  of base income by level); garage, dealers and Motor Works (Clean); training; lawyers, court fines and a judge's
  fix (M7); impound fees; car wash; track fees; hospital (max($1,000, 10% of the bank), capped at $25k; medical
  debt is paid off first by Clean income).
- **Dirty:** crew wages (payroll order: warehouse vaults, then safehouses, then cash on you; never the bank),
  protection, bribes, product, supply runs, imports, the Armorer, Pay & Spray, chop work, intel, respect / truce
  envelopes, jail bribes through a courier, lockpicks ($75), front deposits.
- **Either:** taxi, food, bar, tip line, the used lot.
- **Seizure:** an arrest takes the Dirty Cash and lockpicks on you; a raid takes half a front's float and stock.

## 4. Passive income at each scale (probe, 4–6 econ-day simulations)

| Scale | Clean / econ day | Dirty / econ day | Per hour of play (Clean) |
|---|---|---|---|
| two dealers (60 green each) | — | +$992 | — (+$2.0k Dirty) |
| three cheapest businesses + the dealers | +$816 | +$461 | $1.6k |
| the same, with managers (Dirty wages) | +$1,224 | −$1,021 | $2.4k |
| **mid empire:** 12 managed businesses, 6 turfs, 13 crew | +$6,688 | −$2,396 | $13.4k |
| **late empire:** 30 managed businesses, 16 turfs, 2 Lieutenants, 33 crew | +$24,597 | −$2,427 | $49.2k |
| the late empire **in jail** | **$0** | −$9,032 | none |

A standing empire is Clean-positive and Dirty-negative, because wages ($3.1k a day mid, $9.3k late) outrun
royalties. **Standing still forever doesn't work.** The bank fills, but the payroll needs Dirty Cash that only
play brings in: dealers kept stocked, product, crime. Unpaid crew lose loyalty and walk. At the late scale the
Dirty gap is about $1.2k an hour of play: one decent robbery, or dealers kept supplied by a Lieutenant.

## 5. Casino and the progressive (§45.40: kept, on probation)
- RTP over 120,000 rounds each (`economy`): roulette, baccarat, craps, three-card and the sportsbook all fall
  between 90% and 99.5%. Royale Billions: line game about 91% + 4% jackpot share ≈ 95%.
- The chance of being ahead after **one hour** (seeded simulation of 4,000 sessions; Royale 300 / 60): roulette
  (60 spins, $100 red) 35%; baccarat (70 banker hands) 49%; craps (40 pass decisions) 41%; three-card (60 hands)
  43%; Royale at $100 × 1,300 spins 3.3% (mean −$7.4k on $130k staked); Royale at $10k × 1,300 spins 5%.
- **The billion is life-changing and rare.** It is only in play on a qualifying $10,000 spin. Its share of the 4% is
  priced at the $1B seed, about 7,231 hours of $10k spins per hit.
- **M13 fix (unbounded drift):** the pool grows $400k–$800k every economic day, and before M13 only the player
  could win it. Left alone it would pass about $5.7B, and from there the machine favours the player. Other
  visitors now hit it about once in 400 economic days (a news message, and the pool restarts at $1B). Over 200,000
  simulated days the pool averages $1.24B, has a 99th percentile of $2.0B and peaks at $2.9B. The RTP at that peak
  is 96.9%, so the house always wins in the long run.
- Anti-drought pressure only changes *when* a tier lands, never the long-run average (`ROYALE_DROUGHT_K`).
- **Verdict:** keep the Royale. It is a 95% machine with a lottery tail, not a money engine. A player who hits a
  major or the billion is rich but no more powerful (§7).

## 6. Laundering ladder (M13)
| Route | Fee | Capacity a day |
|---|---|---|
| Dina the fixer (from the start) | 32% | $5,000 |
| Front, level 1 / managed | 25% / 20% | $15,000 / $18,000 |
| Front, level 2 / managed | 15% / 10% | $40,000 / $48,000 |
| Front, level 3 / managed | 10% / **5%** | $100,000 / $120,000 |

Fees round to two decimal places, with a 5% floor. Laundering capacity throttles how fast criminal money becomes
property and businesses, so an early glut of Dirty Cash (pickpocketing, robbery) can't buy an empire.

## 7. Money can't buy power (the early-jackpot stress test, `economy`)
A Nobody given $1.3B in Clean Bank can buy the cheap property and businesses (Rep-gated ones refuse). They still
have 0 Rep, Rank 0, no turf and 0 influence: bought influence counts only up to the earned amount, and they have
earned none. They can't hire: nobody works for a nobody, and wages are Dirty Cash the bank can't supply. They can't
take a turf without the street hold, and the Rank screen says what is missing.

Influence (M13) splits into two parts:
- earned = turfs × 22 + crew × 5 + Lieutenants × 12 + infamy (≤ 400);
- bought = established businesses + paid officers × 8, counted only up to the earned amount.

The result is clamped to 0–1,000.

## 8. The seven Ranks (requirements, routes, bottleneck, time)
| Rank | Needs | Typical income (per hour of play) | Affordable | Bottleneck | Time from a new game* |
|---|---|---|---|---|---|
| 0 Nobody | — | opening jobs ($150 front + pay), pickpockets ~$5–7k/h Dirty | lockpicks, a used car | Rep | — |
| 1 Street Hustler | 100 Rep | street crime + smokes/hot goods, $3–8k Dirty; the fixer $10k/h max to Clean | a $2.5k safehouse | Rep | ~20 min |
| 2 Known Operator | 400 Rep | + green (Gus) and pharma (Feld, 300 Rep) sales | the first $12k–$36k business | Rep, Dirty for wages | 1–1.5 h |
| 3 Crew Leader | 400 Rep, 2 crew | + two dealers (+$2k/h Dirty) | a front (25%) | crew pay (Dirty), Rep 800 | ~2 h |
| 4 Territory Holder | 800 Rep, 2 crew, 1 turf | + royalties $180–950 a turf a day | 3–12 businesses | turf showdowns, a Lieutenant (service days + Dirty) | 3–4 h |
| 5 Underworld Power | 1,500 Rep, 4 crew, 8 turfs, 1 Lieutenant, 450 influence | mid empire ~$13k/h Clean | warehouses, upgrades | turf count, influence | 10–15 h |
| 6 City Kingpin | 2,500 Rep, 6 crew, 16 turfs, 2 Lieutenants, 800 influence, an operating warehouse | late empire ~$49k/h Clean | Valen Point, anything | 16 turfs, 800 influence | 25–40 h |

\*From the measured loops and the requirements. One econ day is 30 minutes. These are play-time estimates for a
focused player, not a timed playthrough.

- **Criminal route** (Rep, crew, turf): the only route to Rank. With no businesses, 16 turfs, 6 crew, 2
  Lieutenants and full infamy earn 806 influence, so a pure criminal Kingpin is possible but hard.
- **Mixed route** (the intended path): businesses and paid officers add bought influence on top of the earned
  part.
- **Legitimate route** (businesses, official racing, the casino): makes money, never Rank.

Every hint names the next Rank's Rep and turf numbers, and Rank requirements only ever grow (`economy`,
`progression`). Losing turf lowers the Rank and dismantles nothing.

## 9. Dominant strategies found and fixed (M13)
| Loop | Before | Fix |
|---|---|---|
| Short visual day | the daily economy paid at visual midnight, so 4-minute days paid ~7× per hour | the daily economy runs on economic days (`econDays`) |
| Sleep | slept straight to payday | one sleep per day; the economy doesn't fast-forward |
| Jail | businesses, dealers and royalties paid while you served (days at 2 s each) | no profit in jail (`JAIL_OPS`); see §4 |
| Jail protection leak | the jail cover paid protection in Clean (≈$500 a day converted) | the cover pays upkeep only |
| Money-bought influence | businesses and cops could carry influence to 800 | bought ≤ earned |
| Pickpocket spree | $1k lifts on tap in rich districts: measured $24k/h camping Crestmoor and $31–38k/h circling the rich districts at a lift every 20 s | district wariness (`PICK_WARY`), much stronger in the rich band (`pickWary`): $4–9k/h; ordinary districts unchanged ($1.5–5k/h) |
| Robbery spree | ~$49k/h from jewellery safes | tills ×0.8, safes ×0.65 (jewellery EV $11.6k → $7.8k) |
| Official racing | ~$60–90k/h Clean | purses retuned (top $15k), same repeat tiers |
| The progressive | drifted to positive EV | other visitors win it (§5) |
| Suppliers | a bought-out supplier **never restocked** (soft lock on the trade and on Lieutenant automation) | half a shelf restocks every economic day (`SUPPLY_RESTOCK`) |
| The Armorer | sold hardware at wholesale and bought it back at 0.9× street at the same counter (a free loop once shelves restock) | he only buys hardware; it comes from Tidewater, boats, raids and drops |
| Lockpick price | at $150 a tier-2 house barely paid for its pick | $75 |
| Business upgrades | paid back faster than the business | 0.6× / 1.2× of the price (47 / 83 days) |

Verified with no change needed:
- car resale (≤85%, no tuning arbitrage, each currency back in proportion);
- no Clean → Dirty route;
- Lieutenants need service days plus Dirty Cash;
- business payback ~41 econ days;
- the cab rule (no Skip with product, no fare over 2 units, none while wanted);
- packages pay once;
- the Zephyr pays once;
- one-off cars can't be sold;
- street-race tiers 100/50/25/25.

## 10. Recovery from broke (`economy`)
A broke player in medical debt can still earn Dirty at once (a pickpocket) and sell a stolen car for cash. Clean
income pays the debt off first and then fills the bank, and debt never exceeds one bill. Starting again needs
nothing that costs money: the opening's first job fronts $150.

## 11. Values finalised by M13 (were provisional)
- **Lockpick:** $75.
- **Robbery:** tills ×0.8, safes ×0.65.
- **Front fees:** 25 / 15 / 10%, manager −5 points, floor 5%.
- **Fixer:** 32% fee, $5,000 a day.
- **Official purses:** VP $2k / $6k / $15k; Cedar Fields $1.6k / $1.8k / $5k.
- **Rank needs:** 100 / 400 / 400 + 2 crew / 800 + 1 turf / 1,500 + 4 crew + 8 turfs + Lieutenant + 450 influence /
  2,500 + 6 crew + 16 turfs + 2 Lieutenants + 800 influence + a warehouse.
- **Jail operations:** unmanaged ×0.5 of upkeep; dealers ×0.3 (×0.55 with a Lieutenant); royalties ×0.3 in a
  Lieutenant's district.
- **Business upgrades:** 0.6× and 1.2× of the price.
- **Pickpocket wariness:** +0.15 a lift, −0.1 an econ hour; at full wariness odds −45 points and take −35%. Rich
  districts: +0.3, −0.06, odds −60 points, take −85%.
- **Supplier restock:** half a shelf a day.
- **Progressive:** visitor wins 1 in 400 days.
