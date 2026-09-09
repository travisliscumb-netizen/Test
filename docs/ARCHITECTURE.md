# Architecture

A record of the decisions that could reasonably have gone the other way, and
why they went this way. Where a choice contradicts the obvious answer, the
reason is stated rather than implied.

---

## 1. No framework

**Chosen:** vanilla ES modules, direct DOM, a keyed reconciler in ~40 lines.

React or Svelte would be the default answer. They were not chosen because
almost every interaction in this app is one a virtual DOM actively obstructs:

- FLIP reordering needs the *real* geometry before and after a mutation, and
  needs nodes to be reused rather than recreated.
- The map holds a canvas and a camera across renders.
- A dragged row must stay under the finger while the list beneath it re-sorts.

All three are fights with a diffing layer and none of them are hard without
one. The reconciler reuses nodes by key and reorders them in place, which is
precisely what FLIP and in-flight gestures need.

The secondary benefit is real on the target device: no framework runtime, no
build step, no toolchain to rot. The whole app is served as-is.

## 2. The optimiser runs on the main thread

**Chosen:** inline, time-boxed to 45 ms.

A Web Worker is the reflexive answer for "optimisation". The largest day on
this route is 48 stops; 2-opt with don't-look bits plus Or-opt converges on
that in single-digit milliseconds — measured, not assumed, and asserted in the
end-to-end suite. A worker would add message-passing latency and a second copy
of the route to keep coherent, in exchange for hiding a cost already below one
frame.

A worker is the right answer at a few hundred stops. At fifty it is cargo cult.
The solver is time-boxed, so if that assumption is ever wrong it degrades to a
slightly worse route rather than a dropped frame.

## 3. A hand-written map engine instead of Leaflet or MapLibre

**Chosen:** one canvas, own tile loader, own camera.

- **Leaflet** places each marker as a DOM node and moves them with CSS during a
  pan. Forty-eight markers plus a route line plus a spring camera is a
  measurable cost on a phone, and marker state changes animate as layout
  rather than on the compositor.
- **MapLibre** needs a vector style and, realistically, a keyed tile endpoint —
  a running dependency and a bill for a personal tool.
- Neither exposes the camera integrator, and the camera is the single most
  important piece of motion in the product.

The engine is ~600 lines and draws tiles, the route, markers, the operator and
a scale bar to one canvas. Tiles are ordinary raster tiles cached by the
service worker, so a route driven once renders offline the next day.

**When no tile is available it does not fabricate one.** The offline ground is
deliberately abstract — a soft halo along the real route — with a line of text
saying imagery is missing and the stops are exact. A drawn street grid would be
inventing geography, and a map that invents geography is worse than one that
admits it has none.

## 4. Service time is *derived*, and the derivation is conservative

The phone can only record when **Done** was tapped. So a recorded gap is

```
gap(prev → cur) = travel(prev, cur) + service(cur) + idle
```

In the operator's own 24 recorded work days, **26% of gaps are under 90
seconds** — bursts of taps catching up after several stops. Treating those as
zero-minute lawns would permanently depress those properties' estimates;
discarding them would throw away real elapsed work.

So a burst is treated as one window: the elapsed time from the last real
anchor, minus its travel, divided across the burst **in proportion to each
stop's current prior**, with every resulting sample marked `batch` and weighted
at 0.35. Gaps long enough to contain a lunch break are kept at weight 0.1
rather than being deleted, because they are weak evidence, not no evidence.

Estimators are medians and MAD throughout, never means. A truck left idling
cannot move a median.

New properties are **shrunk toward the day prior** (empirical Bayes,
half-weight at ~2.5 effective samples). One observation of a lawn is not
knowledge of it, and an app that claims otherwise loses trust the first time
it is confidently wrong.

Without a day-start anchor, the first stop of every session yields no sample at
all — over a season that would leave the first property of each weekday
permanently un-learned. When the start instant is known it is used as a
synthetic anchor at the depot, with a guard: a "start" recorded six hours
before the first stop is a stale flag, not a measurement, and is rejected.

## 5. The travel model was fitted, not guessed

Theil–Sen regression over 291 clean stop-to-stop transitions from the real
season:

```
gap ≈ 18.0 min + 4.16 min per straight-line km
```

≈ **14.4 km/h effective door-to-door** with a trailer in a residential grid.

That cross-validates the operator's own 1.0 settings (15 min service + 4 min
travel = 19) and shows they were slightly optimistic — which is why finish
predictions in the old app ran early.

Only the slope is a pure travel quantity. The intercept mixes service with the
fixed cost of stopping, and those are not separable by observation, so the
fixed cost is held at its prior rather than invented from the intercept. The
model re-fits from the operator's own accumulating data and **refuses to re-fit
on fewer than 40 clean transitions** or on an implausible slope, because a
silently bad travel model would corrupt both the optimiser and the forecast.

## 6. The optimiser minimises finish time, with a stability cost

For a fixed set of stops the service time is constant, so minimising elapsed
time reduces to minimising travel — but only after the constraints that
actually bind:

- **pinned stops** stay where they were put;
- **time windows parsed from the operator's own notes** ("after 9am",
  "Thursdays after 11am so gate open") are penalised at 4× the cost of driving
  when violated, and waiting for one is penalised at 0.85×;
- **displacement from the current order** costs 0.45 min per position.

That last one is the difference between a useful tool and an irritating one. A
route that reshuffles every time it is recomputed is worse than one that never
changes. Only *remaining* stops are ever reordered, the proposal is separate
from applying it, applying it is undoable, and the master order is restorable
in one tap.

Note parsing is deliberately conservative: anything ambiguous yields no
constraint. "Thursday so gate is open" produces nothing, because a fabricated
time window would silently distort every future route.

**On the real route this finds 111 minutes a week on the South crew** (Tuesday
+66, Thursday +36, Monday +9) and correctly reports *no change* on the days
whose hand-built order is already good.

## 7. Optimistic writes with rollback

Every mutation is applied to memory and published **first**, so the interface
responds in the frame the finger lifted, then written in a single IndexedDB
transaction together with its event. If that transaction fails, memory is put
back exactly as it was and the failure is reported.

The alternative — awaiting the write before rendering — is correct but makes
every tap feel like it is waiting on a disk. The alternative to *that* —
optimistic with no rollback — can leave the screen showing work the device
never kept, which is the one failure this app must not have.

The projection and the event share one transaction, so a refresh mid-write
cannot produce a half-written day. Completions are idempotent on their target
state, so a double tap during the animation produces exactly one completion and
one event (asserted end-to-end).

## 8. Backup validates before it writes

`inspect()` is pure and returns a report; `apply()` is the only function that
writes and refuses any report that did not pass. Checks run in dependency
order — format, schema version, **checksum**, declared counts, then structure —
because a checksum mismatch makes everything downstream suspect.

Every refusal names the specific reason and states that nothing was changed.
`apply()` takes a safety copy of the current data first, so restoring the wrong
file is itself reversible.

## 9. Honest haptics

**iOS Safari does not implement the Vibration API.** There is no web API that
drives the Taptic Engine. The one documented route — toggling
`<input type="checkbox" switch>` through a user gesture, iOS 17.4+ — is used,
feature-detected, and never depended on.

Consequently **every haptic is paired with a visual response that carries the
same information alone**: the Done key physically compresses, the counter
animates, the arc advances, the row transforms. Settings says plainly what this
device can and cannot do rather than implying a feature that will not fire.

## 10. Reduced motion is a theme, not a subtraction

`data-motion="calm"` retargets the motion tokens: transitions still travel,
they simply travel briefly and without overshoot, and nothing decorative loops.
Particles are skipped entirely — and also on devices with ≤2 cores or ≤2 GB, and
whenever the page is hidden.

## 11. Battery

GPS accuracy is spent, not assumed: coarse tracking by default, high accuracy
only within 400 m of the next stop or for a few seconds on request, and
tracking suspended whenever the page is hidden. One shared `requestAnimationFrame`
loop drives every spring in the app, because independent rAF callbacks each
cost a scheduling slot and their own layout read/write.

## 12. What was left out on purpose

No accounts, no cloud sync, no admin portal, no crew management, no device
enrolment, no Firebase. Every record carries a stable id and `updatedAt`, and
every state change is also written to an append-only event log — which is what
a later multi-device merge needs, and costs nothing now.

Weather is the one addition beyond the brief. Rain is the largest external
variable in this trade and is named twice in the operator's own list of things
that corrupt a service-time estimate; knowing a band arrives at 2pm changes
which end of the route you run first. It is one keyless endpoint, one request
an hour, cached with a timestamp, and every consumer treats it as optional.
