import { PriceHistoryPoint } from '../../models';

/**
 * Price History helpers (BB-203). Pure functions over durable `/priceHistory`
 * points — no Firestore, and no clock unless one is passed — so the timeline
 * math is unit-testable in isolation from the read service.
 */

/**
 * Merges the own + friends query results into one timeline: dedupe by id (the
 * two reads are disjoint by `spotterUid`, so this is defensive) and sort
 * oldest → newest for charting.
 */
export function mergePricePoints(
  ...groups: PriceHistoryPoint[][]
): PriceHistoryPoint[] {
  const byId = new Map<string, PriceHistoryPoint>();
  for (const group of groups) {
    for (const point of group) {
      if (point.id) {
        byId.set(point.id, point);
      }
    }
  }
  return [...byId.values()].sort(
    (a, b) => a.sightingDate.toMillis() - b.sightingDate.toMillis()
  );
}

/**
 * Prepares the friend-UID list for the `in` query: drop blanks and the viewer
 * themselves (their points come from the own query), then cap at Firestore's
 * `in` limit. Extracted so the branching is testable without Firestore.
 */
export function friendUidsForQuery(
  friendUids: string[],
  selfUid: string,
  cap: number
): string[] {
  return friendUids.filter((u) => !!u && u !== selfUid).slice(0, cap);
}

export interface PriceStats {
  count: number;
  min: number;
  max: number;
  median: number;
}

/** Summary stats over a set of points, or null when there are none. */
export function priceStats(points: PriceHistoryPoint[]): PriceStats | null {
  if (!points.length) {
    return null;
  }
  const prices = points.map((p) => p.price).sort((a, b) => a - b);
  const mid = Math.floor(prices.length / 2);
  const median =
    prices.length % 2 === 1 ? prices[mid] : (prices[mid - 1] + prices[mid]) / 2;
  return {
    count: prices.length,
    min: prices[0],
    max: prices[prices.length - 1],
    median,
  };
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Points observed within the last `days` (cutoff inclusive). */
export function pointsWithinDays(
  points: PriceHistoryPoint[],
  days: number,
  now: number = Date.now()
): PriceHistoryPoint[] {
  const cutoff = now - days * DAY_MS;
  return points.filter((p) => p.sightingDate.toMillis() >= cutoff);
}
