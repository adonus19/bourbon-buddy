/**
 * Bourbon Buddy — Cloud Functions entry point.
 */
import { initializeApp } from "firebase-admin/app";

initializeApp();

// News Feed (BB-050): scheduled RSS fetch + monthly/read cleanup.
export { fetchRssFeeds, cleanupOldArticles, cleanupReadArticles } from "./news";

// Billing kill-switch (BB-120): disable billing when spend hits the budget.
export { capBillingAtBudget } from "./billing";
