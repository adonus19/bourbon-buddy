import { Sighting } from '../../models';

/** Sightings older than this (or manually flagged) are considered stale. */
export const SIGHTING_STALE_DAYS = 30;

const STALE_MS = SIGHTING_STALE_DAYS * 24 * 60 * 60 * 1000;

/** Staleness is computed on read, never stored. */
export function isSightingStale(s: Sighting, now: number = Date.now()): boolean {
  if (s.markedStaleManually) {
    return true;
  }
  return now - s.sightingDate.toMillis() > STALE_MS;
}

/** Lowest price among non-stale sightings, or null if there are none. */
export function bestNonStalePrice(sightings: Sighting[]): number | null {
  const prices = sightings
    .filter((s) => !isSightingStale(s))
    .map((s) => s.price);
  return prices.length ? Math.min(...prices) : null;
}
