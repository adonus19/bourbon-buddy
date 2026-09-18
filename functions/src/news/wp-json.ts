/**
 * WordPress REST API source adapter (BB-240).
 *
 * The Spirits Business publishes daily but has no RSS feed any more: every feed
 * path (/feed, /?feed=rss2, /rss, category feeds) serves the homepage HTML, the
 * page declares no autodiscovery links, and rss-parser died on it with
 * "Invalid character in entity name" every cycle since at least 2026-09-18.
 * Its wp-json endpoint is alive and gives us MORE than RSS would: the real
 * article URL, the full body HTML, and the featured image.
 *
 * Posts are mapped onto the same shape a feed item has, so the ingest loop,
 * thumbnailFrom(), publishedAt() and categorize() all work unchanged.
 */
import { RawFeedItem } from "./parse";
import { htmlToText } from "../ai/article-text";

/** The slice of a wp/v2 post we read. Everything is optional — it's JSON. */
interface WpPost {
  link?: string;
  date_gmt?: string;
  date?: string;
  title?: { rendered?: string };
  excerpt?: { rendered?: string };
  content?: { rendered?: string };
  _embedded?: { "wp:featuredmedia"?: { source_url?: string }[] };
}

/** A mapped post, shaped like the feed items the ingest loop already handles. */
export type WpFeedItem = RawFeedItem & {
  title?: string;
  contentSnippet?: string;
};

/**
 * Ask only for the fields we use and embed only the featured image: the default
 * `_embed=1` response is 129KB for 20 posts, this is 56KB — cheaper than most of
 * the RSS feeds we already pull.
 */
export function wpQuery(base: string, perPage: number): string {
  const sep = base.includes("?") ? "&" : "?";
  return (
    `${base}${sep}per_page=${perPage}&_embed=wp:featuredmedia` +
    "&_fields=link,date_gmt,date,title,excerpt,content,_links,_embedded"
  );
}

/** date_gmt is UTC but carries no zone designator; don't let it parse as local. */
function gmtIso(post: WpPost): string | undefined {
  const raw = post.date_gmt ?? post.date;
  if (!raw) {
    return undefined;
  }
  return /[Zz]|[+-]\d{2}:?\d{2}$/.test(raw) ? raw : `${raw}Z`;
}

/** Map one wp/v2 post onto the feed-item shape the ingest pipeline expects. */
export function mapWpPost(post: WpPost): WpFeedItem | null {
  const link = post.link?.trim();
  if (!link) {
    return null; // nothing to key a document on
  }
  const featured = post._embedded?.["wp:featuredmedia"]?.[0]?.source_url;
  return {
    // rendered fields carry HTML entities (&#8216; etc.); htmlToText decodes them.
    title: htmlToText(post.title?.rendered ?? ""),
    link,
    isoDate: gmtIso(post),
    contentSnippet: htmlToText(post.excerpt?.rendered ?? ""),
    // Full body — the same role <content:encoded> plays for the RSS sources, so
    // it feeds both bodyText (BB-239) and the image ladder's inline-<img> rung.
    "content:encoded": post.content?.rendered ?? "",
    // Top rung of thumbnailFrom's ladder, so the featured image always wins.
    ...(featured ? { enclosure: { url: featured } } : {}),
  };
}

/**
 * Fetch and map recent posts. Best-effort in the same way parseURL is: it
 * throws on a hard failure so ingestSource's caller logs the source as failed.
 */
export async function fetchWpJsonItems(
  base: string,
  perPage = 20,
  timeoutMs = 15000
): Promise<WpFeedItem[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(wpQuery(base, perPage), {
      signal: controller.signal,
      headers: {
        "User-Agent": "BourbonBuddyBot/1.0 (+news ingest)",
        Accept: "application/json",
      },
    });
    if (!res.ok) {
      throw new Error(`wp-json ${res.status} for ${base}`);
    }
    const posts: unknown = await res.json();
    if (!Array.isArray(posts)) {
      throw new Error(`wp-json did not return an array for ${base}`);
    }
    return (posts as WpPost[])
      .map(mapWpPost)
      .filter((p): p is WpFeedItem => p !== null);
  } finally {
    clearTimeout(timer);
  }
}
