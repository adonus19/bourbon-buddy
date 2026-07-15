import { EntryType, OWNED_ENTRY_TYPES } from '../../../models';

/**
 * Which "How you got it" fields apply to an entry type (BB-215). The form no
 * longer has a "Didn't purchase" toggle — the entry type alone decides what's
 * visible and what gets stored.
 */
export interface EntryFieldRules {
  price: boolean;
  bottleSize: boolean;
  where: boolean;
  /** Label for the acquisition-date field, or null to hide it (drinks: the
   *  entry date already answers "when"). */
  dateLabel: string | null;
  remaining: boolean;
}

const DATE_LABELS: Partial<Record<EntryType, string>> = {
  bottle_purchased: 'Purchase date',
  gift_received: 'Date received',
  sample_split: 'Date',
  virtual_tasting: 'Date',
};

export function fieldRulesFor(entryType: EntryType): EntryFieldRules {
  const owned = OWNED_ENTRY_TYPES.includes(entryType);
  return {
    // Splits cost money too; gifts and drinks don't.
    price: entryType === 'bottle_purchased' || entryType === 'sample_split',
    bottleSize: owned,
    where: true,
    dateLabel: DATE_LABELS[entryType] ?? null,
    remaining: owned,
  };
}

/** Stored `didNotPurchase` is now derived, not asked (BB-215). */
export function deriveDidNotPurchase(entryType: EntryType): boolean {
  return entryType !== 'bottle_purchased';
}
