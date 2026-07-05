/**
 * News Feed Cloud Functions (BB-050).
 *   fetchRssFeeds       — every 6h: parse RSS sources, dedupe by URL hash,
 *                         write /newsArticles, skip items older than 90 days.
 *   cleanupOldArticles  — monthly: delete /newsArticles older than 90 days.
 *   cleanupReadArticles — hourly: delete read articleStates older than 24h and
 *                         their /newsArticles docs (Read tab is transient).
 */
import { logger } from "firebase-functions/v2";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import Parser from "rss-parser";

import { RSS_SOURCES } from "./sources";
import {
  categorize,
  publishedAt,
  thumbnailFrom,
  urlHash,
} from "./parse";

const MAX_AGE_DAYS = 90;
const MAX_AGE_MS = MAX_AGE_DAYS * 24 * 60 * 60 * 1000;
const READ_RETENTION_MS = 24 * 60 * 60 * 1000;

type FeedItem = Parser.Item & {
  enclosure?: { url?: string };
  "media:content"?: { $?: { url?: string } };
};

const parser: Parser<unknown, FeedItem> = new Parser({
  timeout: 15000,
  customFields: { item: [["media:content", "media:content"]] },
});

async function ingestSource(
  db: FirebaseFirestore.Firestore,
  source: { name: string; url: string }
): Promise<number> {
  const feed = await parser.parseURL(source.url);
  const now = Date.now();
  let written = 0;

  for (const item of feed.items ?? []) {
    const link = item.link?.trim();
    if (!link) {
      continue;
    }
    const published = publishedAt(item);
    if (published && now - published.getTime() > MAX_AGE_MS) {
      continue; // older than 90 days
    }

    const headline = (item.title ?? "").trim() || "(untitled)";
    const excerpt = (item.contentSnippet ?? "").trim().slice(0, 320) || null;

    await db
      .collection("newsArticles")
      .doc(urlHash(link)) // URL-derived id => dedupe on write
      // merge:true so re-fetching an existing article updates its fields WITHOUT
      // wiping the AI-extracted mentionedBottles/bottlesExtractedAt (BB-130).
      .set(
        {
          sourceName: source.name,
          headline,
          excerpt,
          url: link,
          thumbnailUrl: thumbnailFrom(item),
          publishedAt: published ? Timestamp.fromDate(published) : null,
          fetchedAt: Timestamp.now(),
          categories: categorize(`${headline} ${excerpt ?? ""}`),
          keywords: [],
        },
        { merge: true }
      );
    written++;
  }
  return written;
}

export const fetchRssFeeds = onSchedule(
  { schedule: "every 6 hours", timeoutSeconds: 300, memory: "256MiB" },
  async () => {
    const db = getFirestore();
    const results = await Promise.allSettled(
      RSS_SOURCES.map((s) => ingestSource(db, s))
    );
    results.forEach((r, i) => {
      const name = RSS_SOURCES[i].name;
      if (r.status === "fulfilled") {
        logger.info(`Fetched ${name}: ${r.value} articles`);
      } else {
        logger.error(`Failed ${name}:`, r.reason);
      }
    });
  }
);

export const cleanupOldArticles = onSchedule(
  { schedule: "0 4 1 * *", timeoutSeconds: 300 },
  async () => {
    const db = getFirestore();
    const cutoff = Timestamp.fromMillis(Date.now() - MAX_AGE_MS);
    let deleted = 0;

    // Delete in batches of 400.
    for (;;) {
      const snap = await db
        .collection("newsArticles")
        .where("publishedAt", "<", cutoff)
        .limit(400)
        .get();
      if (snap.empty) {
        break;
      }
      const batch = db.batch();
      snap.docs.forEach((d) => batch.delete(d.ref));
      await batch.commit();
      deleted += snap.size;
      if (snap.size < 400) {
        break;
      }
    }
    logger.info(`cleanupOldArticles removed ${deleted} articles`);
  }
);

/**
 * Read articles are transient: 24h after a user marks one read, drop the read
 * state (clears it from the Read tab) and delete the shared article document.
 * Saved articles are untouched. Runs hourly via a collection-group query over
 * every user's articleStates (requires the composite index in
 * firestore.indexes.json).
 */
export const cleanupReadArticles = onSchedule(
  { schedule: "every 1 hours", timeoutSeconds: 300 },
  async () => {
    const db = getFirestore();
    const cutoff = Timestamp.fromMillis(Date.now() - READ_RETENTION_MS);
    let cleared = 0;

    for (;;) {
      const snap = await db
        .collectionGroup("articleStates")
        .where("state", "==", "read")
        .where("updatedAt", "<", cutoff)
        .limit(300)
        .get();
      if (snap.empty) {
        break;
      }
      const batch = db.batch();
      for (const stateDoc of snap.docs) {
        batch.delete(stateDoc.ref); // remove from the user's Read tab
        if (stateDoc.id) {
          batch.delete(db.collection("newsArticles").doc(stateDoc.id));
        }
      }
      await batch.commit();
      cleared += snap.size;
      if (snap.size < 300) {
        break;
      }
    }
    logger.info(`cleanupReadArticles cleared ${cleared} read articles`);
  }
);
