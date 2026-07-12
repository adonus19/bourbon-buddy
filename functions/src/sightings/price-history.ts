/**
 * Durable price-point store (BB-202).
 *
 * Live /sightings are hard-deleted at 30 days (cleanupStaleSightings), so crowd
 * prices never accumulate into a history. Every sighting therefore mints ONE
 * immutable /priceHistory point at creation time — same catalog key (bourbonId)
 * and own/friends visibility as the sighting, but a permanent lifecycle:
 * write-once, never purged. The point id is the sighting id (1:1), which also
 * makes the backfill idempotent (re-writing the same id with the sighting's own
 * timestamps produces identical data). These are pure builders so they can be
 * unit-tested without the callable/Firestore machinery.
 */
import { FieldValue, Timestamp } from "firebase-admin/firestore";

import { LogSightingData, ValidatedSighting } from "./validate";

export interface PriceHistoryPoint {
  bourbonId: string;
  price: number;
  sightingDate: Timestamp;
  storeName: string | null;
  city: string | null;
  state: string | null;
  spotterUid: string;
  visibility: string;
  sourceSightingId: string;
  createdAt: FieldValue | Timestamp;
}

/**
 * Builds the point for a freshly logged sighting (the logSighting live path).
 * Deliberately carries no `notes` — price history is a price record, not a notes
 * store. `createdAt` is passed in (a serverTimestamp sentinel in production) so
 * the builder stays pure and testable.
 */
export function priceHistoryPoint(
  v: ValidatedSighting,
  d: LogSightingData,
  spotterUid: string,
  sourceSightingId: string,
  createdAt: FieldValue | Timestamp
): PriceHistoryPoint {
  return {
    bourbonId: v.bourbonId,
    price: v.price,
    sightingDate: Timestamp.fromMillis(v.sightingDateMillis),
    storeName: v.storeName,
    city: d.city ?? null,
    state: d.state ?? null,
    spotterUid,
    visibility: v.visibility,
    sourceSightingId,
    createdAt,
  };
}

/**
 * Builds the point from an existing /sightings doc, for the one-time backfill.
 * Carries the sighting's own `createdAt`/`sightingDate` so re-running the
 * backfill writes identical data (idempotent), keyed to the same sighting id.
 */
export function priceHistoryPointFromSighting(
  sightingId: string,
  s: Record<string, unknown>
): PriceHistoryPoint {
  return {
    bourbonId: s["bourbonId"] as string,
    price: s["price"] as number,
    sightingDate: s["sightingDate"] as Timestamp,
    storeName: (s["storeName"] as string) ?? null,
    city: (s["city"] as string) ?? null,
    state: (s["state"] as string) ?? null,
    spotterUid: s["spotterUid"] as string,
    visibility: (s["visibility"] as string) ?? "private",
    sourceSightingId: sightingId,
    createdAt: (s["createdAt"] as Timestamp) ?? FieldValue.serverTimestamp(),
  };
}
