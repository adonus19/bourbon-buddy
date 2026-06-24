/**
 * News Feed Cloud Functions — IMPLEMENTED IN ITERATION 5 (BB-050..052).
 *
 * Planned exports:
 *   fetchRssFeeds      — scheduled every 12h; parses RSS sources (from Remote
 *                        Config), dedupes by URL hash, writes /newsArticles.
 *   cleanupOldArticles — scheduled monthly; deletes articles older than 90 days.
 *
 * Source list lives in docs/bourbon-buddy-feature-spec.md (section 5a).
 */
export {};
