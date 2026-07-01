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
export { sendTestNotification } from "./notifications";

// Wishlist price alerts (It7): sighting-at-or-below-target trigger.
export { onSightingCreated } from "./alerts";

// Sighting guards (BB-163): rate-limited create callable + stale cleanup.
export { logSighting, cleanupStaleSightings } from "./sightings";

// Social graph (BB-101/102): guarded request create, accept/decline, push.
export {
  sendFriendRequest,
  respondToFriendRequest,
  onFriendRequestCreated,
} from "./social";
