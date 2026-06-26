// Shared enum-like string union types used across collections.
// These mirror the value lists in docs/bourbon-buddy-data-model.md.

export type BourbonCategory =
  | 'bourbon'
  | 'rye'
  | 'wheat_whiskey'
  | 'tennessee'
  | 'american_other'
  | 'scotch'
  | 'irish'
  | 'japanese'
  | 'world_other';

export type BourbonSubType =
  | 'single_barrel'
  | 'small_batch'
  | 'blended'
  | 'cask_strength'
  | 'nas'
  | 'straight'
  | 'bottled_in_bond';

export type EntryType =
  | 'drink'
  | 'bottle_purchased'
  | 'gift_received'
  | 'sample_split'
  | 'virtual_tasting';

export type WouldBuyAgain = 'yes' | 'no' | 'maybe';

export type FinishLength = 'short' | 'medium' | 'long';

export type WishlistPriority = 'grail' | 'high' | 'normal' | 'low';

export type WishlistStatus =
  | 'actively_looking'
  | 'casually_looking'
  | 'just_browsing'
  | 'logged' // found & added to the Cellar (lives there, hidden from Hunt List)
  | 'got_away'; // abandoned — shown in the "Got Away" archive

/** Wishlist statuses that appear in the active Hunt List. */
export const ACTIVE_WISHLIST_STATUSES: WishlistStatus[] = [
  'actively_looking',
  'casually_looking',
  'just_browsing',
];

export type ArticleState = 'read' | 'saved' | 'dismissed';

export type NewsCategory =
  | 'general'
  | 'release'
  | 'award'
  | 'distillery'
  | 'event';

// Numeric ordering for priority sorting (lower = higher priority).
export const WISHLIST_PRIORITY_ORDER: Record<WishlistPriority, number> = {
  grail: 0,
  high: 1,
  normal: 2,
  low: 3,
};
