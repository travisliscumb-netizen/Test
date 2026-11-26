// GPS smoothing for a slow vehicle that stops constantly.
//
// Constant-velocity Kalman filter in the local plane. With isotropic noise the
// 2-D problem separates into two independent 1-D [position, velocity] filters
// that share a gate. Measurement noise comes from the fix's own reported
// accuracy; process noise is a tractor's plausible acceleration.
//
// Gating: a fix whose innovation is wildly inconsistent with the track (and
// would imply an impossible speed) is rejected. Three rejections in a row mean
// the track is wrong, not the fixes (tunnel, cold start): the filter resets.

import { toXY, toLngLat, type LngLat } from './geo.ts';

export interface Fix {
  lng: number;
  lat: number;
  /** 68 % horizontal accuracy radius, metres. */
  accuracy: number;
  /** ms epoch */
  t: number;
  /** m/s from the device, if any */
  speed?: number | null;
  /** degrees from the device, if any */
  heading?: number | null;
}

export interface Track {
  position: LngLat;
  /** m/s */
  speed: number;
  /** degrees clockwise from north; null until the vehicle has moved */
  heading: number | null;
  /** 1-σ position uncertainty, metres */
  sigma: number;
  /** raw accuracy of the last accepted fix */
  accuracy: number;
  t: number;
  accepted: boolean;
  /** consecutive rejected fixes */
  rejects: number;
}

interface Axis {
  p: number;
  v: number;
  // covariance [[a, b], [b, c]]
  a: number;
  b: number;
  c: number;
}

export interface KalmanOptions {
  /** process acceleration noise, m/s² */
  accel: number;
  /** maximum plausible speed, m/s */
  maxSpeed: number;
  /** gate in standard deviations */
  gate: number;
}

const DEFAULTS: KalmanOptions = { accel: 1.2, maxSpeed: 22, gate: 6 };

export class GpsFilter {
  private x: Axis | null = null;
  private y: Axis | null = null;
  private t = 0;
  private lastHeading: number | null = null;
  private rejects = 0;
  private lastAccuracy = 0;
  private readonly o: KalmanOptions;

  constructor(opts: Partial<KalmanOptions> = {}) {
    this.o = { ...DEFAULTS, ...opts };
  }

  reset(): void {
    this.x = this.y = null;
    this.rejects = 0;
  }

  update(f: Fix): Track {
    const acc = Math.max(3, Number.isFinite(f.accuracy) ? f.accuracy : 50);
    const [mx, my] = toXY([f.lng, f.lat]);
    const r = acc * acc;
    if (!this.x || !this.y || f.t <= this.t - 60_000) {
      this.init(mx, my, r, f);
      return this.snapshot(f.t, true);
    }
    const dt = Math.max(0, Math.min(30, (f.t - this.t) / 1000));
    if (dt > 0) {
      this.predict(this.x, dt);
      this.predict(this.y, dt);
    }
    // Innovation and its variance (per axis; same structure both axes).
    const ix = mx - this.x.p;
    const iy = my - this.y.p;
    const sx = this.x.a + r;
    const sy = this.y.a + r;
    const d2 = (ix * ix) / sx + (iy * iy) / sy;
    const jump = Math.hypot(ix, iy);
    const impliedSpeed = dt > 0 ? jump / dt : jump;
    const reject = d2 > this.o.gate * this.o.gate && impliedSpeed > this.o.maxSpeed && jump > 3 * acc;
    this.t = f.t;
    if (reject) {
      this.rejects++;
      if (this.rejects >= 3) {
        this.init(mx, my, r, f);
        return this.snapshot(f.t, true);
      }
      return this.snapshot(f.t, false);
    }
    this.rejects = 0;
    this.correct(this.x, mx, r);
    this.correct(this.y, my, r);
    // Blend in the device's Doppler speed when it is offered: it is far better
    // than position differencing at walking pace.
    if (f.speed != null && f.speed >= 0 && f.heading != null && f.heading >= 0 && f.speed > 0.8) {
      const rad = (f.heading * Math.PI) / 180;
      const w = 0.5;
      this.x.v = (1 - w) * this.x.v + w * f.speed * Math.sin(rad);
      this.y.v = (1 - w) * this.y.v + w * f.speed * Math.cos(rad);
    } else if (f.speed != null && f.speed >= 0 && f.speed < 0.3) {
      this.x.v *= 0.3;
      this.y.v *= 0.3;
    }
    this.lastAccuracy = acc;
    return this.snapshot(f.t, true);
  }

  private init(mx: number, my: number, r: number, f: Fix): void {
    this.x = { p: mx, v: 0, a: r, b: 0, c: 25 };
    this.y = { p: my, v: 0, a: r, b: 0, c: 25 };
    this.t = f.t;
    this.rejects = 0;
    this.lastAccuracy = Math.sqrt(r);
  }

  private predict(s: Axis, dt: number): void {
    const q = this.o.accel * this.o.accel;
    s.p += s.v * dt;
    const a = s.a + 2 * dt * s.b + dt * dt * s.c + (q * dt ** 4) / 4;
    const b = s.b + dt * s.c + (q * dt ** 3) / 2;
    const c = s.c + q * dt * dt;
    s.a = a;
    s.b = b;
    s.c = c;
  }

  private correct(s: Axis, z: number, r: number): void {
    const S = s.a + r;
    const kp = s.a / S;
    const kv = s.b / S;
    const inn = z - s.p;
    s.p += kp * inn;
    s.v += kv * inn;
    const a = (1 - kp) * s.a;
    const b = (1 - kp) * s.b;
    const c = s.c - kv * s.b;
    s.a = a;
    s.b = b;
    s.c = c;
  }

  private snapshot(t: number, accepted: boolean): Track {
    const x = this.x!;
    const y = this.y!;
    const speed = Math.hypot(x.v, y.v);
    if (speed > 0.9) this.lastHeading = ((Math.atan2(x.v, y.v) * 180) / Math.PI + 360) % 360;
    return {
      position: toLngLat([x.p, y.p]),
      speed,
      heading: this.lastHeading,
      sigma: Math.sqrt((x.a + y.a) / 2),
      accuracy: this.lastAccuracy,
      t,
      accepted,
      rejects: this.rejects,
    };
  }
}
