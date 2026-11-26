// Proximity copilot: turns a filtered GPS track into a small number of
// well-timed cues. It never completes a stop by itself.
//
// Presence is judged against the PROPERTY (parcel + driveway polygons), not a
// point: clearing a deep driveway takes the tractor 40–60 m from its entrance
// at working speed, and that is not "leaving".
//
// Phases for the active stop:
//   far → approach (≤ APPROACH m, announce once with hazards)
//       → at (on/near the property and slow for DWELL s)
//       → leaving (worked ≥ MIN_WORK s, then off the property for LEAVE_S s, not done)
// Also: dwelling at the NEXT driveway while the active one is not marked done
// raises the same "mark it done?" cue — with stops a median 37 m apart, a
// forgotten tap usually looks like this, not like driving away.
// A poor fix pauses all proximity logic and says so: silence must never be
// mistaken for "nothing nearby".

import { dist, pointInPolygon, projectOnLine, type LngLat } from '../core/geo.ts';
import type { Track } from '../core/kalman.ts';

export const APPROACH = 140;
export const ARRIVE = 28;
export const LEAVE = 55;
export const ZONE_IN = 8;
export const ZONE_OUT = 30;
export const DWELL_S = 4;
export const LEAVE_S = 6;
export const MIN_WORK_S = 40;
export const GPS_LIMIT = 30;

export type Phase = 'far' | 'approach' | 'at' | 'leaving';

export interface CopilotStop {
  seq: number;
  stopPoint: LngLat;
  target: LngLat;
  /** parcel ring and driveway polygons */
  zone?: LngLat[][];
}

export type Cue =
  | { kind: 'approach'; seq: number; distance: number }
  | { kind: 'arrived'; seq: number }
  | { kind: 'leaving-undone'; seq: number; reason: 'drove-away' | 'at-next' }
  | { kind: 'revisit-nearby'; seq: number; distance: number }
  | { kind: 'gps-poor'; accuracy: number }
  | { kind: 'gps-ok' };

export interface CopilotView {
  phase: Phase;
  /** metres to the active stop's target, null without a usable fix */
  distance: number | null;
  gpsUsable: boolean;
  /** seconds spent at the active stop */
  dwell: number;
}

/** 0 inside any polygon, else distance to the nearest polygon edge. */
export function distanceToZone(p: LngLat, zone: LngLat[][] | undefined): number {
  if (!zone || !zone.length) return Infinity;
  let best = Infinity;
  for (const ring of zone) {
    if (ring.length < 3) continue;
    if (pointInPolygon(p, [ring])) return 0;
    const pr = projectOnLine(p, ring);
    if (pr && pr.distance < best) best = pr.distance;
  }
  return best;
}

export class Copilot {
  private activeSeq: number | null = null;
  private phase: Phase = 'far';
  private announced = new Set<number>();
  private arrivedAt: number | null = null;
  private slowSince: number | null = null;
  private outSince: number | null = null;
  private atNextSince: number | null = null;
  private leavingPrompted = new Set<number>();
  private revisitPrompted = new Map<number, number>();
  private gpsOk = true;

  /** Change the stop being worked (after Done, a skip, or a re-plan). */
  setActive(seq: number | null): void {
    if (seq === this.activeSeq) return;
    this.activeSeq = seq;
    this.phase = 'far';
    this.arrivedAt = null;
    this.slowSince = null;
    this.outSince = null;
    this.atNextSince = null;
  }

  update(track: Track | null, active: CopilotStop | null, revisit: CopilotStop[], now: number, following: CopilotStop | null = null): { view: CopilotView; cues: Cue[] } {
    const cues: Cue[] = [];
    if (active?.seq !== this.activeSeq) this.setActive(active?.seq ?? null);
    const usable = !!track && track.accuracy <= GPS_LIMIT && track.sigma <= GPS_LIMIT * 1.2;
    if (track && usable !== this.gpsOk) {
      cues.push(usable ? { kind: 'gps-ok' } : { kind: 'gps-poor', accuracy: Math.round(track.accuracy) });
      this.gpsOk = usable;
    }
    if (!track || !usable || !active) {
      return { view: { phase: this.phase, distance: track && active ? dist(track.position, active.target) : null, gpsUsable: usable, dwell: 0 }, cues };
    }
    const p = track.position;
    const d = Math.min(dist(p, active.target), dist(p, active.stopPoint));
    const dz = distanceToZone(p, active.zone);
    const onProperty = d <= ARRIVE || dz <= ZONE_IN;
    const offProperty = d > LEAVE && dz > ZONE_OUT;
    const slow = track.speed < 1.4;
    if (slow) this.slowSince = this.slowSince ?? now;
    else this.slowSince = null;
    const worked = this.arrivedAt !== null ? (now - this.arrivedAt) / 1000 : 0;

    switch (this.phase) {
      case 'far':
      case 'approach':
        if (onProperty && this.slowSince !== null && now - this.slowSince >= DWELL_S * 1000) {
          this.phase = 'at';
          this.arrivedAt = now;
          this.outSince = null;
          cues.push({ kind: 'arrived', seq: active.seq });
        } else if (d <= APPROACH) {
          if (this.phase === 'far' && !this.announced.has(active.seq)) {
            this.announced.add(active.seq);
            cues.push({ kind: 'approach', seq: active.seq, distance: Math.round(d) });
          }
          this.phase = 'approach';
        } else {
          this.phase = 'far';
        }
        break;
      case 'at':
        if (offProperty && !slow) {
          this.outSince = this.outSince ?? now;
          if (now - this.outSince >= LEAVE_S * 1000) {
            if (worked >= MIN_WORK_S && !this.leavingPrompted.has(active.seq)) {
              this.leavingPrompted.add(active.seq);
              this.phase = 'leaving';
              cues.push({ kind: 'leaving-undone', seq: active.seq, reason: 'drove-away' });
            } else if (worked < MIN_WORK_S) {
              // a brief stop on the way past: not an arrival after all
              this.phase = d <= APPROACH ? 'approach' : 'far';
              this.arrivedAt = null;
            }
          }
        } else if (!offProperty) {
          this.outSince = null;
        }
        // Working the next driveway with this one unmarked.
        if (following && worked >= MIN_WORK_S && !this.leavingPrompted.has(active.seq)) {
          const dn = Math.min(dist(p, following.target), dist(p, following.stopPoint));
          const atNext = (dn <= ARRIVE || distanceToZone(p, following.zone) <= ZONE_IN) && dz > ZONE_IN && slow;
          if (atNext) {
            this.atNextSince = this.atNextSince ?? now;
            if (now - this.atNextSince >= (DWELL_S + 6) * 1000) {
              this.leavingPrompted.add(active.seq);
              this.phase = 'leaving';
              cues.push({ kind: 'leaving-undone', seq: active.seq, reason: 'at-next' });
            }
          } else this.atNextSince = null;
        }
        break;
      case 'leaving':
        if (onProperty) this.phase = 'at';
        break;
    }

    // Deferred/blocked stops close by: offer a retry, at most every 10 min each.
    for (const r of revisit) {
      if (r.seq === active.seq) continue;
      const rd = dist(p, r.stopPoint);
      if (rd <= 35 && slow) {
        const last = this.revisitPrompted.get(r.seq) ?? 0;
        if (now - last > 10 * 60_000) {
          this.revisitPrompted.set(r.seq, now);
          cues.push({ kind: 'revisit-nearby', seq: r.seq, distance: Math.round(rd) });
        }
      }
    }
    const dwell = this.phase === 'at' && this.arrivedAt ? (now - this.arrivedAt) / 1000 : 0;
    return { view: { phase: this.phase, distance: d, gpsUsable: true, dwell }, cues };
  }
}
