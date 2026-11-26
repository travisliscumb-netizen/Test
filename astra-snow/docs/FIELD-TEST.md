# Field-test plan

Nothing below has been tested on the actual iPhone or in the tractor. Each
item says what to do and what counts as a pass. Keep Ted's paper/email list
as the fallback for the first nights.

## 0. Install (5 minutes, at home)

1. Open the unlock link in Safari → **Share → Add to Home Screen** → open
   ASTRA from the home screen.
2. Preflight must show: Route 162/162, Storage "saving · protected".
   If it says "NOT SAVING", Safari is in private mode — leave it.
3. SYSTEM → **EXPORT BACKUP** once, to prove the download works.

Pass: preflight all green except GPS/City (fine indoors).

## 1. Daytime dry run (30–45 minutes, no snow)

Drive the first ~20 stops in Ted's order with the phone in its mount.

| Check | Pass |
|---|---|
| Voice announces each stop on approach (silent switch ON and OFF) | heard both ways; note it if the switch mutes it |
| A haptic tick on DONE (iOS 18+) | felt; note if not |
| "AT DRIVEWAY" appears when stopped at the right driveway | within ~5 s, not at the neighbour's |
| Working up a long driveway does NOT trigger "Leaving… mark it done?" | no prompt |
| Skipping DONE and starting the next driveway → "not marked done" prompt | prompt within ~15 s |
| Screen stays on while ASTRA is open (home-screen app) | never sleeps |
| Gloves on: DONE, LATER, UNDO, STREET usable | every tap lands |
| Landscape mount, if used | everything readable, nothing cut off |
| Corner lots: open #32 and #141 at the curb, confirm the driveway street | saved |
| Battery: % at start and end | record it |

## 2. First storm night

- Use Ted's order (the default). Tap STREET when the street state changes.
- Watch INTEL once while parked: are "City crews active" and the street
  states plausible against what you see?
- At the end: NIGHT → END SHIFT, then SYSTEM → EXPORT BACKUP. Send the backup
  if you want the night analysed.

Record: any wrong "next" stop; any DONE that didn't register; any prompt that
was wrong; GPS accuracy typical/worst; finish forecast at 25 %, 50 %, 75 %
of the route vs the real finish; battery per hour; anything that made you
look at the phone longer than a second.

## 3. After 3 storms with City plowing

- INTEL starts showing per-street timing from recorded storms.
- When City crews are seen starting on residential streets, try PLAN →
  ANALYZE. Apply only if it makes sense to you; RETURN TO TED'S ORDER is one
  tap. Compare windrow returns on those nights with nights on Ted's order.

## Decisions for you

- **Background collection**: allow adding the collector workflow to `main`
  (free; republishes public City data in this public repo), or create a
  private repository for it (recommended), or keep phone-only collection.
- **Root `vercel.json`** on this branch exists only to deploy ASTRA's preview;
  do not merge it into `main`.
- A cleaner URL needs either a new Vercel project (the connector could not
  create one) or a custom domain.
