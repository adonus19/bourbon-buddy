import { NewsArticle } from '../../models';

/** The user's feed-customization settings (the four editable arrays). */
export interface NewsPrefs {
  watchKeywords: string[];
  watchDistilleries: string[];
  activeCategories: string[];
  excludeKeywords: string[];
}

export const DEFAULT_NEWS_PREFS: NewsPrefs = {
  watchKeywords: [],
  watchDistilleries: [],
  activeCategories: ['general'],
  excludeKeywords: [],
};

export const NEWS_CATEGORIES: { value: string; label: string }[] = [
  { value: 'release', label: 'Release Announcements' },
  { value: 'award', label: 'Award Results' },
  { value: 'distillery', label: 'Distillery News' },
  { value: 'event', label: 'Conventions & Festivals' },
  { value: 'general', label: 'General News' },
];

function articleText(a: NewsArticle): string {
  return `${a.headline} ${a.excerpt ?? ''}`.toLowerCase();
}

/** Category match + exclude-keyword filter for the main feed. */
export function passesPrefs(a: NewsArticle, p: NewsPrefs): boolean {
  if (
    p.activeCategories.length &&
    !a.categories.some((c) => p.activeCategories.includes(c))
  ) {
    return false;
  }
  const text = articleText(a);
  if (p.excludeKeywords.some((k) => k && text.includes(k.toLowerCase()))) {
    return false;
  }
  return true;
}

/** Whether the article matches a watch keyword/distillery (for highlighting). */
export function isWatched(a: NewsArticle, p: NewsPrefs): boolean {
  const text = articleText(a);
  return [...p.watchKeywords, ...p.watchDistilleries].some(
    (k) => k && text.includes(k.toLowerCase())
  );
}
