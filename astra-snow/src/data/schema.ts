// Data contracts shared by the app, the build tools and the tests.

import type { LngLat } from '../core/geo.ts';
import type { PinWrap } from '../core/crypto.ts';

export interface RoadSegment {
  id: number;
  asset: string | null;
  /** "GUNN ST", "GROVE ST E" */
  name: string;
  oneway: string | null;
  /** P priority, S secondary, R residential (City plow class). */
  plowClass: 'P' | 'S' | 'R' | null;
  plowRoute: number | null;
  saltRoute: number | null;
  carto: string | null;
  speed: number | null;
  width: number | null;
  from: string | null;
  to: string | null;
  lines: LngLat[][];
}

export interface RoadsDoc {
  schema: 'astra.roads/1';
  source: string;
  licence: string;
  fetchedAt: string;
  count: number;
  sha256: string;
  segments: RoadSegment[];
}

export interface Driveway {
  id: number;
  area: number;
  street: string;
  roadId: number;
  /** Driveway edge point nearest the street: where the blower starts. */
  entrance: LngLat;
  /** Street-centreline point opposite the entrance: where the tractor turns in. */
  curb: LngLat;
  polygon: LngLat[];
  share: number;
  streetConfidence: 'clear' | 'ambiguous' | 'ortho-verified';
  alternatives: { street: string; roadId: number; gapMetres: number }[];
}

export interface NoteFlags {
  driveways: number;
  drivewayStreets: string[];
  hazards: string[];
  throwRule: boolean;
  conditional: boolean;
}

export interface Stop {
  /** 1-based position in the dispatcher's original list. Stable identity. */
  seq: number;
  /** Verbatim dispatcher row. Canonical; never edited. */
  raw: string;
  address: string;
  number: string;
  street: string;
  /** Verbatim note text from the row (empty when none). */
  note: string;
  flags: NoteFlags;
  addressId: number;
  parcelId: string | null;
  roll: string | null;
  /** City address point. */
  point: LngLat;
  /** Where the tractor stops on the street. */
  stopPoint: LngLat;
  /** Primary driveway entrance (or the address point without a driveway). */
  target: LngLat;
  approachRoadId: number | null;
  frontRoadId: number | null;
  plowRoute: number | null;
  plowClass: 'P' | 'S' | 'R' | null;
  side: 'L' | 'R' | null;
  parcel: LngLat[] | null;
  driveways: Driveway[];
  checks: Record<string, number>;
  verified: boolean;
  issues: string[];
}

export interface RouteDoc {
  schema: 'astra.route/1';
  id: string;
  title: string;
  source: { kind: 'email'; from: string; subject: string; sentAt: string; rows: number; sha256: string };
  builtAt: string;
  datasets: Record<string, string>;
  stops: Stop[];
}

/** Envelope for the encrypted route file served to the client. */
export interface SealedDoc {
  schema: 'astra.sealed/1';
  alg: 'AES-GCM-256';
  /** base64url 12-byte IV */
  iv: string;
  /** base64url ciphertext (includes GCM tag) */
  data: string;
  /** sha256 hex of the plaintext JSON, checked after decryption */
  sha256: string;
  /** Short non-secret label for the UI. */
  label: string;
  stops: number;
  /** Optional: the route key wrapped by a short PIN. */
  pin?: PinWrap;
}
