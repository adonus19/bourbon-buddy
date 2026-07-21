import { EntryType } from '../../models';

/**
 * Receiving a shared bottle (BB-230c). Shelf / Journal / Graveyard are DERIVED
 * views, not settable fields — the cellar view comes from `entryType` +
 * `bottleRemainingPct` (0 → finished/graveyard, >0 → open/shelf; a `drink`
 * lives in the journal). So the receive chooser presents them as intents that
 * PRESET the log form. Kept pure so the receive page and the add-entry prefill
 * agree on the mapping.
 */
export type CellarIntent = 'shelf' | 'journal' | 'graveyard';

export interface CellarPreset {
  entryType: EntryType;
  /** Drives the derived bottleStatus; null for a drink (no bottle to track). */
  bottleRemainingPct: number | null;
}

/** The log-form preset for a cellar intent (see bottle-lifecycle derivation). */
export function cellarIntentPreset(intent: CellarIntent): CellarPreset {
  switch (intent) {
    case 'journal':
      // A pour/tasting, not an owned bottle.
      return { entryType: 'drink', bottleRemainingPct: null };
    case 'graveyard':
      // Owned but finished — an empty bottle derives to the graveyard.
      return { entryType: 'bottle_purchased', bottleRemainingPct: 0 };
    case 'shelf':
    default:
      // Owned and open.
      return { entryType: 'bottle_purchased', bottleRemainingPct: 100 };
  }
}

export function isCellarIntent(value: unknown): value is CellarIntent {
  return value === 'shelf' || value === 'journal' || value === 'graveyard';
}
