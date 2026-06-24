/**
 * Bourbon Buddy — Cloud Functions entry point.
 *
 * The News Feed functions (scheduled RSS fetch + monthly cleanup) land here in
 * Iteration 5. For now this file just initializes the Admin SDK so the codebase
 * compiles and deploys cleanly as part of Iteration 0 scaffolding.
 */
import { initializeApp } from "firebase-admin/app";

initializeApp();

// Iteration 5 — News Feed:
// export { fetchRssFeeds, cleanupOldArticles } from "./news";
