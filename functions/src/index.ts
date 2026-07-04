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

// AI Find Bottles (BB-130): extract bottle mentions from new articles (cached),
// a scheduled sweep for un-extracted/updated articles, plus a backfill callable.
export {
  extractBottlesFromArticle,
  sweepArticleBottles,
  backfillArticleBottles,
} from "./ai";

// Social graph (BB-101/102/103): request create, accept/decline, remove, block.
export {
  sendFriendRequest,
  respondToFriendRequest,
  removeFriend,
  blockUser,
  onFriendRequestCreated,
} from "./social";
