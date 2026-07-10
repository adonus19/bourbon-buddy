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
