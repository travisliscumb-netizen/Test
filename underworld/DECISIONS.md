# DECISIONS — the owner rulings that shape the remaining work

Full text: handoff §45.1–§45.39; history: OVERHAUL_STATUS.md. Highlights that constrain M7–M13:

- **Money:** Dirty Cash (no weight/cap, seized when carried or in the car at arrest) and Clean Bank (§45.1, §45.2).
  Casino and lottery are Clean Bank only, routine casino play has a modest house edge (§45.4, §45.5). Legal fees and
  fines are Clean Bank; Dirty only through risky corruption (§24).
- **Laundering:** early fixer ~30–35% (§45.6), fronts later; buying a business never buys Rank/influence/turf (§45.7).
- **Jail:** 1:1 world time; no jail income farming (§45.8); commissary separate (§45.18, §45.22); speeds 1×/3×/5×/7×
  (§24, §37.4); fugitive penalty modest (§37.5).
- **Ranks:** Nobody, Street Hustler, Known Operator, Crew Leader, Territory Holder, Underworld Power, City Kingpin.
  Rep = who knows you; Rank = power; money can't buy Rank; non-destructive downrank (§45.23).
- **Vehicles:** one fleet registry, real parking only, HOT until Chop Shop clean, physical impound (§45.29–31).
  One-offs: unsellable, unchoppable, never staked; Ambassador taken straight into a bay as HOT (§45.39).
- **Rooftop Zephyr:** one-time rare find (§45.39).
- **Roads:** the road graph is authoritative; curved-road architecture not reopened without a real bug (§45.38).
- **Autonomy:** §45.39 — ordinary decisions are Claude's; stop only for true blockers, very large rewrites,
  effort checkpoints, or CONTENT COMPLETE.

## Decisions taken in the autonomous phase (M7–M12; Claude's calls under §45.39)
- **Court (M7):** every arrest goes to a hearing; witnessed crimes build a case file that goes stale; small cases end
  in a Clean fine; a warrant is recognised by sight only; recapture adds a fifth of the new sentence (7–60 days).
- **Jail (M8):** two escape routes, neither certain (drain 30–90%, crew-run laundry truck 20–85%, needs Crew Leader);
  the jail tightens after repeat escapes; the truck route comes out at one star (nobody saw it).
- **Casino (M9):** the old player-favoured 60/40 tuning is removed outright (no knobs left). Limits $10k floor /
  $250k VIP at Rep 1,300 (tables, poker buy-in, sportsbook); Royale Billions ~95% (line game ~91%, jackpots 4%),
  billion = world-time progressive on a $10k spin only (~7,000 h of $10k play per hit). Payouts round down.
- **Fronts (M9, retuned M13):** carried Dirty Cash in person; capacity $15k/$40k/$100k a day by level at 25/15/10%
  (manager +20% capacity, −5 points, floor 5%; top-ups keep running in jail); a raid takes half the float.
- **Crime (M10):** robbable shop-front trades only; security +1 a robbery, −1 per 5 economic days; owner lockout.
  Lockpicks: $75 (M13; was $150) cash at Sully's, carry 5, one per break-in, charged and taken at arrest. Burglary: one 17.5%
  report roll on entry (call lands 20–45 s later); tier 4+ homes are contained while you hide inside.
- **Phone/taxi (M11):** six groups; a priority inbox with deep links; Intel map layer shows only what you know;
  cabs refuse wanted fares and loads over 2 units, and never Skip with product aboard.
- **Opening (M12):** six Rosa jobs finished by doing the real thing; modest Dirty pay; no Rank handed out.
- **Economy (M13, ECONOMY.md):** the daily economy turns on economic days (every 24 econ hours = 30 min of play),
  not visual midnight; one sleep a day and it skips no payday; no profit in jail (`JAIL_OPS`); influence = earned
  (turfs, crew, Lieutenants, infamy) + bought (businesses, paid officers) capped at earned; Rank needs
  100 / 400 / 400+2 crew / 800+1 turf / 1,500+4 crew+8 turfs+Lt+450 / 2,500+6 crew+16 turfs+2 Lts+800+warehouse;
  laundering ladder fixer 32% ($5k) → fronts 25/20 → 15/10 → 10/5%; robbery tills ×0.8 / safes ×0.65; pickpocket
  wariness per district, much stronger in the rich districts (circling them ≈ $6.6k/h, was $31–38k/h); official purses $2k/$6k/$15k (VP) and $1.6k/$1.8k/$5k (Cedar Fields), Clean, no Rep;
  business upgrades 0.6×/1.2× of price; suppliers restock half a shelf a day; the Armorer buys hardware but no
  longer sells it; the Royale progressive is also won by other visitors (1 in 400 econ days), so it stays bounded
  (~$1.25B average) and the machine never turns positive. Royale Billions kept (95%, a lottery tail).
