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
import { FieldValue, getFirestore, Timestamp } from "firebase-admin/firestore";
import Parser from "rss-parser";

import { RSS_SOURCES, RssSource } from "./sources";
import {
  categorize,
  publishedAt,
  thumbnailFrom,
  urlHash,
} from "./parse";
import { fetchOgImage } from "./og-image";
import { fetchWpJsonItems, WpFeedItem } from "./wp-json";
import {
  fetchArticlePage,
  fetchSitemap,
  selectCandidates,
  SitemapFeedItem,
} from "./sitemap";
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
// Article bodies live in their own top-level collection (BB-239), NOT on the
// article doc. The body is server-only (AI extraction); the Dispatch feed reads
// whole article documents and the client SDK has no field projection, so a body
// stored alongside the card fields is ~75KB per 25-article page that the UI
// never renders. Rules deny the client this collection entirely.
const BODIES = "articleBodies";
// Per-source ingest health (BB-245). Written every run so a source that quietly
// stops producing is visible in the app, not just buried in Cloud Logging.
const HEALTH = "sourceHealth";
// URLs we fetched and deliberately did not store (BB-245). Without this, a page
// that yields no article is invisible to the existence check and gets re-fetched
// on EVERY run: Breaking Bourbon re-touches old reviews, so ~13 of 34 candidates
// in the lastmod window are years-old articles the 90-day filter drops. The
// marker is what makes "only fetch what's new" actually true.
const SKIPPED = "newsSkipped";
// Page fetches for a sitemap source run at the same width as the og:image pool.
const SITEMAP_CONCURRENCY = 4;

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
  item: FeedItem | WpFeedItem | SitemapFeedItem;
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

/**
 * Items for a "sitemap" source (BB-245). The sitemap is one cheap request; a
 * page fetch happens ONLY for URLs we don't already hold, which is what keeps
 * this affordable — an edited old review re-enters the candidate list on every
 * run and costs a document lookup, not a download. Steady state for Breaking
 * Bourbon is well under one page fetch per cycle.
 */
async function fetchSitemapItems(
  db: FirebaseFirestore.Firestore,
  source: RssSource
): Promise<SitemapFeedItem[]> {
  const cfg = source.sitemap;
  if (!cfg) {
    throw new Error(`source ${source.name} is kind "sitemap" with no config`);
  }
  const entries = await fetchSitemap(source.url);
  const candidates = selectCandidates(entries, {
    pathPrefix: cfg.pathPrefix,
    windowDays: cfg.windowDays,
  });

  // Spend a request only on URLs we have neither stored nor already rejected.
  const unseen: string[] = [];
  for (const c of candidates) {
    const id = urlHash(c.loc);
    const [article, skipped] = await Promise.all([
      db.collection("newsArticles").doc(id).get(),
      db.collection(SKIPPED).doc(id).get(),
    ]);
    if (!article.exists && !skipped.exists) {
      unseen.push(c.loc);
    }
  }

  const now = Date.now();
  const items: SitemapFeedItem[] = [];
  await pool(
    unseen.slice(0, cfg.maxFetchesPerRun),
    SITEMAP_CONCURRENCY,
    async (url) => {
      const item = await fetchArticlePage(url);
      // No Article JSON-LD, or no usable date — nothing we can store.
      if (!item) {
        await markSkipped(db, url, source.name, "no-article-data");
        return;
      }
      // Recent lastmod, old article: the page was edited or the sitemap was
      // regenerated. The ingest loop's 90-day filter would drop it anyway; mark
      // it so we never pay for the page again.
      const published = publishedAt(item);
      if (published && now - published.getTime() > MAX_AGE_MS) {
        await markSkipped(db, url, source.name, "older-than-max-age");
        return;
      }
      items.push(item);
    }
  );
  return items;
}

/** Remember that a URL was fetched and produced nothing worth storing. */
async function markSkipped(
  db: FirebaseFirestore.Firestore,
  url: string,
  sourceName: string,
  reason: string
): Promise<void> {
  try {
    await db
      .collection(SKIPPED)
      .doc(urlHash(url))
      .set({ url, sourceName, reason, skippedAt: Timestamp.now() });
  } catch (err) {
    logger.warn(`Failed to mark ${url} skipped`, err); // worst case: refetched
  }
}

async function ingestSource(
  db: FirebaseFirestore.Firestore,
  source: RssSource
): Promise<number> {
  // BB-240: a source is either an XML feed or a WordPress REST endpoint; both
  // yield the same item shape, so everything downstream is identical.
  const items: (FeedItem | WpFeedItem | SitemapFeedItem)[] =
    source.kind === "wp-json"
      ? await fetchWpJsonItems(source.url)
      : source.kind === "sitemap"
        ? await fetchSitemapItems(db, source)
        : (await parser.parseURL(source.url)).items ?? [];
  const now = Date.now();
  let written = 0;

  const fresh: FreshItem[] = [];
  for (const item of items) {
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
    //
    // BB-239: this used to read `item.content`, which rss-parser sets from
    // <description> (the ~320-char teaser) — parseItemRss writes it last and
    // overwrites anything else. The full body lives on item["content:encoded"].
    // Reading the wrong key meant bodyText was ALWAYS a teaser, so it never
    // cleared the extractor's MIN_BODY_CHARS bar and every article got re-fetched
    // over the network — the opposite of what BB-130/BB-227 intended.
    // Longer-wins rather than a plain ?? so an empty or stub content:encoded
    // can't lose to a teaser that actually carries more text.
    const fullBody = (item["content:encoded"] ?? "").trim();
    const teaser = (item.content ?? "").trim();
    const bodyText =
      htmlToText(fullBody.length >= teaser.length ? fullBody : teaser)
        .slice(0, MAX_BODY_CHARS) || null;

    const doc: Record<string, unknown> = {
      sourceName: source.name,
      headline,
      excerpt,
      // Pre-BB-239 docs carry bodyText inline; strip it as each is re-ingested
      // so the feed stops paying for a field only the server ever reads.
      bodyText: FieldValue.delete(),
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

    const id = urlHash(link); // URL-derived id => dedupe on write
    const batch = db.batch();
    // merge:true so re-fetching an existing article updates its fields WITHOUT
    // wiping the AI-extracted mentionedBottles/bottlesExtractedAt (BB-130).
    batch.set(db.collection("newsArticles").doc(id), doc, { merge: true });
    if (bodyText) {
      batch.set(
        db.collection(BODIES).doc(id),
        { bodyText, url: link, updatedAt: Timestamp.now() },
        { merge: true }
      );
    }
    await batch.commit();
    written++;
  }
  return written;
}

/**
 * Per-source ingest health (BB-245).
 *
 * The zero-item warning added in BB-240 only reaches Google Cloud Logging, which
 * is pull, not push — findable once you already suspect something, and buried
 * among audit-log noise. This writes the same signal somewhere the owner
 * actually looks (the admin screen), and keeps the two facts a log line can't:
 * WHICH source and SINCE WHEN.
 *
 * `consecutiveZeroRuns` uses increment() so it needs no read; a run that
 * produces articles resets it and stamps lastSuccessAt. Server-only — rules
 * deny clients everything except an admin read.
 */
async function recordHealth(
  db: FirebaseFirestore.Firestore,
  name: string,
  count: number | null,
  error: string | null
): Promise<void> {
  const healthy = count !== null && count > 0;
  try {
    await db
      .collection(HEALTH)
      .doc(name)
      .set(
        {
          name,
          lastRunAt: Timestamp.now(),
          itemCount: count ?? 0,
          lastError: error,
          ...(healthy
            ? { lastSuccessAt: Timestamp.now(), consecutiveZeroRuns: 0 }
            : { consecutiveZeroRuns: FieldValue.increment(1) }),
        },
        { merge: true }
      );
  } catch (err) {
    // Health bookkeeping must never take the ingest down with it.
    logger.error(`Failed to record health for ${name}`, err);
  }
}

export const fetchRssFeeds = onSchedule(
  { schedule: "every 6 hours", timeoutSeconds: 300, memory: "256MiB" },
  async () => {
    const db = getFirestore();
    const results = await Promise.allSettled(
      RSS_SOURCES.map((s) => ingestSource(db, s))
    );
    await Promise.all(
      results.map((r, i) => {
        const name = RSS_SOURCES[i].name;
        if (r.status === "rejected") {
          logger.error(`Failed ${name}:`, r.reason);
          return recordHealth(db, name, null, String(r.reason).slice(0, 500));
        }
        if (r.value === 0) {
          // BB-240: a source can rot for months while still "succeeding" —
          // Promise.allSettled hides it and an INFO line reads like a normal
          // run. Zero items from a live publisher means it needs looking at.
          logger.warn(`Fetched ${name}: 0 articles — source may be dead`);
        } else {
          logger.info(`Fetched ${name}: ${r.value} articles`);
        }
        return recordHealth(db, name, r.value, null);
      })
    );
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
      snap.docs.forEach((d) => {
        batch.delete(d.ref);
        batch.delete(db.collection(BODIES).doc(d.id)); // BB-239: no orphans
      });
      await batch.commit();
      deleted += snap.size;
      if (snap.size < 400) {
        break;
      }
    }
    // Skip markers (BB-245) outlive their usefulness once the URL has fallen out
    // of every source's lastmod window; drop them on the same monthly sweep so
    // they can't grow without bound.
    let skipsDropped = 0;
    for (;;) {
      const snap = await db
        .collection(SKIPPED)
        .where("skippedAt", "<", cutoff)
        .limit(400)
        .get();
      if (snap.empty) {
        break;
      }
      const batch = db.batch();
      snap.docs.forEach((d) => batch.delete(d.ref));
      await batch.commit();
      skipsDropped += snap.size;
      if (snap.size < 400) {
        break;
      }
    }
    logger.info(
      `cleanupOldArticles removed ${deleted} articles, ${skipsDropped} skip markers`
    );
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
          batch.delete(db.collection(BODIES).doc(stateDoc.id)); // BB-239
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
