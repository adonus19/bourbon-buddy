import { Timestamp } from '@angular/fire/firestore';
import { LogEntry } from '../../models';
import { deriveBottleStatus } from './bottle-lifecycle';

/**
 * "Your history" roll-up (BB-194): every log entry the user has for one catalog
 * bottle (`bourbonId`), aggregated on read from the already-loaded entries
 * signal — no extra Firestore reads. A log entry is a physical bottle instance,
 * so re-buying the same bottle yields several instances that group here.
 */

export interface PricePoint {
  date: Timestamp;
  price: number;
}

export interface BottleHistory {
  /** All instances of this bourbonId, newest first. */
  instances: LogEntry[];
  count: number;
  avgRating: number | null;
  openCount: number;
  finishedCount: number;
  firstLoggedAt: Timestamp | null;
  lastLoggedAt: Timestamp | null;
  /** Purchased instances with a price, oldest first — the price trend. */
  priceTrend: PricePoint[];
}

/** One barrel in the single-barrel variance comparison (BB-195). */
export interface BarrelRow {
  entryId: string | undefined;
  label: string;
  rating: number | null;
  isFavorite: boolean;
}

/**
 * Barrel-by-barrel comparison for a single-barrel bottle (BB-195). Returns rows
 * only when there are 2+ single-barrel instances (otherwise there's nothing to
 * compare); the highest-rated barrel is flagged as the favorite.
 */
export function barrelComparison(instances: LogEntry[]): BarrelRow[] {
  const singles = instances.filter((e) => e.subType === 'single_barrel');
  if (singles.length < 2) {
    return [];
  }
  const rows: BarrelRow[] = singles.map((e) => ({
    entryId: e.id,
    label:
      e.barrelLabel ||
      (e.barrelNumber ? `Barrel ${e.barrelNumber}` : 'Unlabeled barrel'),
    rating: e.rating ?? null,
    isFavorite: false,
  }));

  let bestIdx = -1;
  let best = -Infinity;
  rows.forEach((r, i) => {
    if (r.rating != null && r.rating > best) {
      best = r.rating;
      bestIdx = i;
    }
  });
  if (bestIdx >= 0) {
    rows[bestIdx].isFavorite = true;
  }
  return rows;
}

export function bottleHistory(
  entries: LogEntry[],
  bourbonId: string
): BottleHistory {
  const instances = entries
    .filter((e) => e.bourbonId === bourbonId)
    .sort((a, b) => b.entryDate.toMillis() - a.entryDate.toMillis());

  const ratings = instances
    .map((e) => e.rating)
    .filter((r): r is number => r != null);
  const avgRating = ratings.length
    ? Math.round((ratings.reduce((s, r) => s + r, 0) / ratings.length) * 10) / 10
    : null;

  let openCount = 0;
  let finishedCount = 0;
  for (const e of instances) {
    const status = deriveBottleStatus(e);
    if (status === 'open') {
      openCount++;
    } else if (status === 'finished') {
      finishedCount++;
    }
  }

  const oldestFirst = [...instances].reverse();
  const firstLoggedAt = oldestFirst[0]?.entryDate ?? null;
  const lastLoggedAt = instances[0]?.entryDate ?? null;

  const priceTrend: PricePoint[] = instances
    .filter((e) => !e.didNotPurchase && e.purchasePrice != null)
    .map((e) => ({
      date: e.purchaseDate ?? e.entryDate,
      price: e.purchasePrice as number,
    }))
    .sort((a, b) => a.date.toMillis() - b.date.toMillis());

  return {
    instances,
    count: instances.length,
    avgRating,
    openCount,
    finishedCount,
    firstLoggedAt,
    lastLoggedAt,
    priceTrend,
  };
}
