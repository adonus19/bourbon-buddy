/**
 * News Feed Cloud Functions (BB-050).
 *   fetchRssFeeds      — every 12h: parse RSS sources, dedupe by URL hash,
 *                        write /newsArticles, skip items older than 90 days.
 *   cleanupOldArticles — monthly: delete /newsArticles older than 90 days.
 */
import { createHash } from "crypto";
import { logger } from "firebase-functions/v2";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import Parser from "rss-parser";

import { RSS_SOURCES } from "./sources";

const MAX_AGE_DAYS = 90;
const MAX_AGE_MS = MAX_AGE_DAYS * 24 * 60 * 60 * 1000;

type FeedItem = Parser.Item & {
  enclosure?: { url?: string };
  "media:content"?: { $?: { url?: string } };
};

const parser: Parser<unknown, FeedItem> = new Parser({
  timeout: 15000,
  customFields: { item: [["media:content", "media:content"]] },
});

function urlHash(url: string): string {
  return createHash("sha1").update(url).digest("hex");
}

/** Lightweight category tagging from the headline + excerpt text. */
function categorize(text: string): string[] {
  const t = text.toLowerCase();
  const cats = new Set<string>(["general"]); // catch-all (on by default)
  if (/\b(release|launch|unveil|debut|new bourbon|new release)\b/.test(t)) {
    cats.add("release");
  }
  if (/\b(award|winner|medal|gold|competition|best of)\b/.test(t)) {
    cats.add("award");
  }
  if (/\b(festival|convention|fest|expo)\b/.test(t)) {
    cats.add("event");
  }
  if (/\bdistiller(y|ies)\b/.test(t)) {
    cats.add("distillery");
  }
  return [...cats];
}

function thumbnailFrom(item: FeedItem): string | null {
  return item.enclosure?.url ?? item["media:content"]?.$?.url ?? null;
}

function publishedAt(item: FeedItem): Date | null {
  const raw = item.isoDate ?? item.pubDate;
  if (!raw) {
    return null;
  }
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

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
      .set({
        sourceName: source.name,
        headline,
        excerpt,
        url: link,
        thumbnailUrl: thumbnailFrom(item),
        publishedAt: published ? Timestamp.fromDate(published) : null,
        fetchedAt: Timestamp.now(),
        categories: categorize(`${headline} ${excerpt ?? ""}`),
        keywords: [],
      });
    written++;
  }
  return written;
}

export const fetchRssFeeds = onSchedule(
  { schedule: "every 12 hours", timeoutSeconds: 300, memory: "256MiB" },
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
