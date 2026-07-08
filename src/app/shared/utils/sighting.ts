import { Sighting } from '../../models';

/**
 * Freshness tiers (BB-171), all computed on read, never stored:
 *   fresh — ≤ 15 days: almost certainly still on the shelf
 *   aging — > 15 and ≤ 30 days: getting old, but maybe still there
 *   stale — > 30 days OR manually flagged: eligible for cleanup
 */
export type SightingFreshness = 'fresh' | 'aging' | 'stale';

/** Sightings older than this become "aging". */
export const SIGHTING_AGING_DAYS = 15;
/** Sightings older than this (or manually flagged) are considered stale. */
export const SIGHTING_STALE_DAYS = 30;

const DAY_MS = 24 * 60 * 60 * 1000;
const AGING_MS = SIGHTING_AGING_DAYS * DAY_MS;
const STALE_MS = SIGHTING_STALE_DAYS * DAY_MS;

/**
 * Disputes needed to force the stale tier (BB-194) — and they must outnumber
 * confirms, so one grudge vote can't bury a sighting others just verified.
 */
export const DISPUTE_STALE_THRESHOLD = 2;

/**
 * The freshness clock (BB-194): an in-person confirmation restarts it. The
 * server's 30-day hard cleanup still keys off sightingDate, so a confirm
 * extends the badge only inside that window — it never resurrects a sighting.
 */
function freshnessClockMillis(s: Sighting): number {
  const confirmed = s.lastConfirmedAt?.toMillis() ?? 0;
  return Math.max(s.sightingDate.toMillis(), confirmed);
}

/** True when the community has voted this sighting off the shelf (BB-194). */
export function isCommunityStale(s: Sighting): boolean {
  const disputes = s.disputeCount ?? 0;
  return disputes >= DISPUTE_STALE_THRESHOLD && disputes > (s.confirmCount ?? 0);
}

/**
 * Three-tier freshness for a sighting, computed on read. This is a TRUST
 * signal, not just an age: manual flags and community "gone" votes force
 * stale, and in-person confirmations keep it fresh.
 */
export function sightingFreshness(
  s: Sighting,
  now: number = Date.now()
): SightingFreshness {
  if (s.markedStaleManually || isCommunityStale(s)) {
    return 'stale';
  }
  const age = now - freshnessClockMillis(s);
  if (age > STALE_MS) {
    return 'stale';
  }
  if (age > AGING_MS) {
    return 'aging';
  }
  return 'fresh';
}

/** Staleness is computed on read, never stored. */
export function isSightingStale(s: Sighting, now: number = Date.now()): boolean {
  return sightingFreshness(s, now) === 'stale';
}

/** Lowest price among non-stale sightings, or null if there are none. */
export function bestNonStalePrice(sightings: Sighting[]): number | null {
  const prices = sightings
    .filter((s) => !isSightingStale(s))
    .map((s) => s.price);
  return prices.length ? Math.min(...prices) : null;
}
