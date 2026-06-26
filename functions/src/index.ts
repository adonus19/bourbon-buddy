/**
 * Bourbon Buddy — Cloud Functions entry point.
 */
import { initializeApp } from "firebase-admin/app";

initializeApp();

// News Feed (BB-050): scheduled RSS fetch + monthly cleanup.
export { fetchRssFeeds, cleanupOldArticles } from "./news";
