/**
 * Bourbon Buddy — Cloud Functions entry point.
 */
import { initializeApp } from "firebase-admin/app";

initializeApp();

// News Feed (BB-050): scheduled RSS fetch + monthly/read cleanup.
export { fetchRssFeeds, cleanupOldArticles, cleanupReadArticles } from "./news";

// Billing kill-switch (BB-120): disable billing when spend hits the budget.
export { capBillingAtBudget } from "./billing";
// Notifications (BB-090): callable test sender (reuses the send-helper).
// Inbox cleanup (BB-113): daily purge of notifications older than 30 days.
export { sendTestNotification, cleanupOldNotifications } from "./notifications";

// Wishlist price alerts (It7): sighting-at-or-below-target trigger.
export { onSightingCreated } from "./alerts";

// Sighting guards (BB-163): rate-limited create callable + stale cleanup.
export { logSighting, cleanupStaleSightings } from "./sightings";
// Community confirmation (BB-194): presence-gated confirm/dispute votes.
export { confirmSighting } from "./sightings/confirm";

// Nearby Retailer Picker (BB-187): Overpass POI lookup, geohash-cached.
export { nearbyRetailers } from "./places";

// AI Find Bottles (BB-130): extract bottle mentions from new articles (cached),
// a scheduled sweep for un-extracted/updated articles, plus a backfill callable.
// refreshArticleBottleFlavor (BB-199) re-syncs chip flavor tags with the catalog.
export {
  extractBottlesFromArticle,
  sweepArticleBottles,
  backfillArticleBottles,
  refreshArticleBottleFlavor,
  backfillArticleBottleFlavor,
} from "./ai";

// AI Flavor Enrichment (BB-185): on-demand callable + a proactive hourly sweep
// (and manual backfill) that keep /bourbons flavor profiles adequate.
export {
  enrichBottleFlavor,
  sweepFlavorEnrichment,
  backfillFlavorEnrichment,
} from "./ai";

// Taste Match (BB-199): per-user taste vector maintained on the profile doc
// from their own high-rated tasting tags; powers badges + sighting alerts.
export { onLogEntryWrittenUpdateTaste } from "./taste";

// Social graph (BB-101/102/103): request create, accept/decline, remove, block.
export {
  sendFriendRequest,
  respondToFriendRequest,
  removeFriend,
  blockUser,
  onFriendRequestCreated,
} from "./social";
