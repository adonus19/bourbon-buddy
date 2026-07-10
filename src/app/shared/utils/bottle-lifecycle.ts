import { BottleStatus, LogEntry, OWNED_ENTRY_TYPES } from '../../models';

/**
 * Bottle lifecycle helpers (BB-191/192). A log entry is a *physical bottle
 * instance / tasting event*; these pure functions derive the Cellar's Shelf /
 * Journal / Graveyard views on read — nothing here is stored beyond the single
 * explicit `bottleStatus` lifecycle field.
 */

/** The three Cellar segments. Journal is the full history; the others filter it. */
export type CellarView = 'shelf' | 'journal' | 'graveyard';

export const CELLAR_VIEWS: CellarView[] = ['shelf', 'journal', 'graveyard'];

/** True when the entry represents a bottle the user physically owns. */
export function isOwnedBottle(entry: LogEntry): boolean {
  return OWNED_ENTRY_TYPES.includes(entry.entryType);
}

/**
 * Effective bottle status. Owned bottles carry an explicit `bottleStatus`;
 * legacy entries written before the field existed fall back to
 * `bottleRemainingPct` (`0` → finished, otherwise open) — so **no migration or
 * backfill is required**. Non-owned entries (drinks/samples/virtual) have no
 * bottle to track and return `null`.
 */
export function deriveBottleStatus(entry: LogEntry): BottleStatus | null {
  if (!isOwnedBottle(entry)) {
    return null;
  }
  if (entry.bottleStatus) {
    return entry.bottleStatus;
  }
  return entry.bottleRemainingPct === 0 ? 'finished' : 'open';
}

/** An owned bottle that is still open — belongs on the Shelf. */
export function isOnShelf(entry: LogEntry): boolean {
  return deriveBottleStatus(entry) === 'open';
}

/** An owned bottle that has been killed — belongs in the Graveyard. */
export function isFinishedBottle(entry: LogEntry): boolean {
  return deriveBottleStatus(entry) === 'finished';
}

/** Whether an entry belongs in the given Cellar view. Journal holds everything. */
export function matchesCellarView(entry: LogEntry, view: CellarView): boolean {
  switch (view) {
    case 'shelf':
      return isOnShelf(entry);
    case 'graveyard':
      return isFinishedBottle(entry);
    case 'journal':
    default:
      return true;
  }
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Days from purchase to kill for a finished bottle, or `null` unless the bottle
 * is finished and both `purchaseDate` and `finishedAt` exist. Never negative.
 */
export function timeToKillDays(entry: LogEntry): number | null {
  if (deriveBottleStatus(entry) !== 'finished') {
    return null;
  }
  const start = entry.purchaseDate?.toMillis();
  const end = entry.finishedAt?.toMillis();
  if (start == null || end == null || end < start) {
    return null;
  }
  return Math.round((end - start) / DAY_MS);
}
