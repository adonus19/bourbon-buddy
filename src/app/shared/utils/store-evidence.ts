import { PriceHistoryPoint } from '../../models';

/**
 * Store evidence math (BB-224). Pure functions over the user's OWN
 * `/priceHistory` points at one store — the receipts shown *beside* the manual
 * `priceTier`, never replacing it: the user's gut call stays the user's
 * (see store-note.model.ts).
 *
 * No Firestore and no clock unless one is passed, so the math is unit-testable
 * apart from the read service.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

/** MSRP lookup by `bourbonId` — only bottles whose catalog msrp is known. */
export type MsrpLookup = Readonly<Record<string, number | null | undefined>>;

export interface StoreEvidence {
  /** Points observed at this store. */
  sightingCount: number;
  /** Distinct calendar days with a sighting — the "visits" figure. */
  visitCount: number;
  /** Most recent observation, or null when there are none. */
  lastSeen: Date | null;
  /** Distinct catalog bottles spotted here. */
  bottlesSpotted: number;
  /**
   * Mean percent difference from MSRP across points whose bottle has a catalog
   * msrp (+12 = 12% over MSRP, -5 = 5% under). Null when no point qualifies —
   * the panel then hides the figure rather than implying a zero.
   */
  avgPctVsMsrp: number | null;
  /** How many points backed `avgPctVsMsrp` (shown as the sample size). */
  msrpSampleSize: number;
}

/** Local calendar-day key, so two sightings on one trip count as one visit. */
function dayKey(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

/** Percent difference of an observed price from MSRP; null unless both are usable. */
export function pctVsMsrp(
  price: number,
  msrp: number | null | undefined
): number | null {
  if (!Number.isFinite(price) || !msrp || msrp <= 0) {
    return null;
  }
  return ((price - msrp) / msrp) * 100;
}

/**
 * Rolls the user's points at one store into the evidence panel's figures.
 * `msrpByBourbonId` carries only the bottles we resolved from the catalog;
 * unknown bottles simply sit out the MSRP average.
 */
export function storeEvidence(
  points: PriceHistoryPoint[],
  msrpByBourbonId: MsrpLookup = {}
): StoreEvidence {
  const days = new Set<string>();
  const bottles = new Set<string>();
  let lastSeenMs: number | null = null;
  let pctSum = 0;
  let pctCount = 0;

  for (const p of points) {
    const ms = p.sightingDate.toMillis();
    days.add(dayKey(ms));
    bottles.add(p.bourbonId);
    if (lastSeenMs === null || ms > lastSeenMs) {
      lastSeenMs = ms;
    }
    const pct = pctVsMsrp(p.price, msrpByBourbonId[p.bourbonId]);
    if (pct !== null) {
      pctSum += pct;
      pctCount += 1;
    }
  }

  return {
    sightingCount: points.length,
    visitCount: days.size,
    lastSeen: lastSeenMs === null ? null : new Date(lastSeenMs),
    bottlesSpotted: bottles.size,
    avgPctVsMsrp: pctCount ? pctSum / pctCount : null,
    msrpSampleSize: pctCount,
  };
}

/**
 * The distinct bottles to resolve from the catalog, newest-first and capped —
 * one `getDoc` each, so the cap is the read budget for a store detail view.
 */
export function bottlesToResolve(
  points: PriceHistoryPoint[],
  cap: number
): string[] {
  const seen: string[] = [];
  const byNewest = [...points].sort(
    (a, b) => b.sightingDate.toMillis() - a.sightingDate.toMillis()
  );
  for (const p of byNewest) {
    if (p.bourbonId && !seen.includes(p.bourbonId)) {
      seen.push(p.bourbonId);
      if (seen.length >= cap) {
        break;
      }
    }
  }
  return seen;
}

/**
 * Points still inside the 30-day sighting window, newest-first — the sightings
 * that are still live on the shelf side. Derived from the points we already
 * read, so the "live sightings" list costs zero extra reads.
 */
export function liveStorePoints(
  points: PriceHistoryPoint[],
  now: number = Date.now(),
  days = 30
): PriceHistoryPoint[] {
  const cutoff = now - days * DAY_MS;
  return points
    .filter((p) => p.sightingDate.toMillis() >= cutoff)
    .sort((a, b) => b.sightingDate.toMillis() - a.sightingDate.toMillis());
}

/**
 * Distinct recent stores from the user's own points, newest-first (BB-225's
 * "recent stores" suggestions). Keyed per LOCATION (name + city), matching
 * store identity.
 */
export interface RecentStore {
  name: string;
  city: string | null;
  state: string | null;
}

export function recentStores(
  points: PriceHistoryPoint[],
  cap: number
): RecentStore[] {
  const byNewest = [...points].sort(
    (a, b) => b.sightingDate.toMillis() - a.sightingDate.toMillis()
  );
  const out: RecentStore[] = [];
  const keys = new Set<string>();
  for (const p of byNewest) {
    const name = (p.storeName ?? '').trim();
    if (!name) {
      continue;
    }
    const city = (p.city ?? '').trim() || null;
    const key = `${name.toLowerCase()}|${(city ?? '').toLowerCase()}`;
    if (keys.has(key)) {
      continue;
    }
    keys.add(key);
    out.push({ name, city, state: (p.state ?? '').trim() || null });
    if (out.length >= cap) {
      break;
    }
  }
  return out;
}
