// Display-only news constants for the Dispatch feed filters.

/** Time-window filter for the feed query. */
export type NewsWindow = '7d' | '30d' | 'all';

export const NEWS_WINDOWS: { value: NewsWindow; label: string }[] = [
  { value: '7d', label: 'Last 7 days' },
  { value: '30d', label: 'Last 30 days' },
  { value: 'all', label: 'All time' },
];

/**
 * Source names for the per-source filter. Mirrors the active list in
 * functions/src/news/sources.ts — keep in sync when sources change. Used only
 * for the filter dropdown; the feed itself reads whatever is in Firestore.
 */
export const NEWS_SOURCE_NAMES: string[] = [
  'The Whiskey Wash',
  'Fred Minnick',
  'The Spirits Business',
  'BourbonBlog',
  'Bourbon Guy',
  'Bourbon & Banter',
  'The Daily Pour',
];
