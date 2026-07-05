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

/** Three-tier freshness for a sighting, computed on read. */
export function sightingFreshness(
  s: Sighting,
  now: number = Date.now()
): SightingFreshness {
  if (s.markedStaleManually) {
    return 'stale';
  }
  const age = now - s.sightingDate.toMillis();
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
