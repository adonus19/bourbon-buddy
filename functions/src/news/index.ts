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
import { fetchOgImage } from "./og-image";
import { htmlToText } from "../ai/article-text";

const MAX_AGE_DAYS = 90;
const MAX_AGE_MS = MAX_AGE_DAYS * 24 * 60 * 60 * 1000;
const READ_RETENTION_MS = 24 * 60 * 60 * 1000;
// Full article body (from the feed's content:encoded) cached for AI bottle
// extraction only (BB-130). The short `excerpt` still drives the UI card.
// Matches the extractor's MAX_TEXT_CHARS so a long listicle's tail bottles
// aren't pre-truncated out of the stored body before the model ever sees them.
const MAX_BODY_CHARS = 12000;
// og:image fallback (BB-238) for feeds that carry no image in the item at all.
// Only runs for items the feed itself couldn't supply, so on a steady-state
// cycle it's a handful of requests. Bounded so a slow host can't eat the 300s
// ingest budget: worst case here is MAX/CONCURRENCY * TIMEOUT ≈ 32s per source.
const OG_IMAGE_TIMEOUT_MS = 5000;
const OG_IMAGE_CONCURRENCY = 4;
const OG_IMAGE_MAX_PER_SOURCE = 25;

type FeedItem = Parser.Item & {
  enclosure?: { url?: string };
  "media:content"?: { $?: { url?: string } };
  "media:thumbnail"?: { $?: { url?: string } };
  // rss-parser puts <content:encoded> on its own key; `content` is the
  // <description> teaser, which parseItemRss writes last. Both are scanned for
  // a hero image (BB-238) — see parse.ts's thumbnailFrom.
  "content:encoded"?: string;
  content?: string;
};

const parser: Parser<unknown, FeedItem> = new Parser({
  timeout: 15000,
  customFields: {
    item: [
      ["media:content", "media:content"],
      ["media:thumbnail", "media:thumbnail"],
    ],
  },
});

/** Feed items that survived the link/age filter, with their parsed date. */
interface FreshItem {
  item: FeedItem;
  link: string;
  published: Date | null;
}

/** Run `work` over `items` with at most `limit` in flight. */
async function pool<T>(
  items: T[],
  limit: number,
  work: (item: T) => Promise<void>
): Promise<void> {
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, () =>
    (async () => {
      for (let i = next++; i < items.length; i = next++) {
        await work(items[i]);
      }
    })()
  );
  await Promise.all(workers);
}

/**
 * Hero image per item, keyed by link (BB-238). The feed itself answers for
 * nearly every source; only items it can't supply cost an og:image fetch, and
 * those are capped so one slow host can't stall the whole ingest.
 */
async function resolveThumbnails(
  fresh: FreshItem[]
): Promise<Map<string, string | null>> {
  const thumbs = new Map<string, string | null>();
  const needsFetch: FreshItem[] = [];
  for (const f of fresh) {
    const fromFeed = thumbnailFrom(f.item, f.link);
    thumbs.set(f.link, fromFeed);
    if (!fromFeed) {
      needsFetch.push(f);
    }
  }
  await pool(
    needsFetch.slice(0, OG_IMAGE_MAX_PER_SOURCE),
    OG_IMAGE_CONCURRENCY,
    async (f) => {
      thumbs.set(f.link, await fetchOgImage(f.link, OG_IMAGE_TIMEOUT_MS));
    }
  );
  return thumbs;
}

async function ingestSource(
  db: FirebaseFirestore.Firestore,
  source: { name: string; url: string }
): Promise<number> {
  const feed = await parser.parseURL(source.url);
  const now = Date.now();
  let written = 0;

  const fresh: FreshItem[] = [];
  for (const item of feed.items ?? []) {
    const link = item.link?.trim();
    if (!link) {
      continue;
    }
    const published = publishedAt(item);
    if (published && now - published.getTime() > MAX_AGE_MS) {
      continue; // older than 90 days
    }
    fresh.push({ item, link, published });
  }

  const thumbs = await resolveThumbnails(fresh);

  for (const { item, link, published } of fresh) {
    const headline = (item.title ?? "").trim() || "(untitled)";
    const excerpt = (item.contentSnippet ?? "").trim().slice(0, 320) || null;
    // Full body for AI extraction only (not shown in the UI). Empty when the
    // feed syndicates just a teaser — the extractor then fetches the URL itself.
    const bodyText = htmlToText(item.content ?? "").slice(0, MAX_BODY_CHARS) || null;

    const doc: Record<string, unknown> = {
      sourceName: source.name,
      headline,
      excerpt,
      bodyText,
      url: link,
      publishedAt: published ? Timestamp.fromDate(published) : null,
      fetchedAt: Timestamp.now(),
      categories: categorize(`${headline} ${excerpt ?? ""}`),
      keywords: [],
    };
    // Only written when we actually found one: with merge:true a null here
    // would ERASE a good image stored by an earlier run (BB-238) — e.g. when a
    // later og:image fetch times out, or a feed drops its media:content.
    const thumbnailUrl = thumbs.get(link);
    if (thumbnailUrl) {
      doc.thumbnailUrl = thumbnailUrl;
    }

    await db
      .collection("newsArticles")
      .doc(urlHash(link)) // URL-derived id => dedupe on write
      // merge:true so re-fetching an existing article updates its fields WITHOUT
      // wiping the AI-extracted mentionedBottles/bottlesExtractedAt (BB-130).
      .set(doc, { merge: true });
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
