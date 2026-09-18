/**
 * Sitemap + JSON-LD source adapter (BB-245).
 *
 * Breaking Bourbon is Webflow and publishes no feed of any kind — /feed, /rss,
 * /feed.xml, /blog/rss.xml and wp-json all 404, so neither the RSS path nor
 * BB-240's wp-json path applies. Its sitemap is the only entry point, and
 * robots.txt advertises exactly that (a Sitemap: line and no Disallow rules).
 *
 * The site splits in two, which is why `pathPrefix` is not optional in practice:
 *   /review/  (~2,400 urls) carries a JSON-LD Article block with a clean
 *             headline, a real datePublished, a description and an image.
 *   everything else (press releases, /article/, roundups…) has og: tags only
 *             and NO publish date anywhere.
 * `lastmod` is NOT a substitute: /whiskey-roundup/april-2021 carries
 * lastmod=2022-11-11 because a site migration touched every page. Deriving
 * publishedAt from it would misorder the feed, defeat the 90-day ingest filter
 * and confuse cleanupOldArticles — so only sections with a real date are
 * ingested.
 *
 * Cost: one sitemap fetch per cycle, then a page fetch ONLY for URLs we don't
 * already hold (the caller does that check). Steady state is well under one
 * page fetch per cycle.
 */
import { RawFeedItem } from "./parse";
import { htmlToText } from "../ai/article-text";

/** One <url> entry from a sitemap. */
export interface SitemapEntry {
  loc: string;
  lastmod: Date | null;
}

/** A mapped article, shaped like the feed items the ingest loop handles. */
export type SitemapFeedItem = RawFeedItem & {
  title?: string;
  contentSnippet?: string;
};

/** Pull <loc>/<lastmod> pairs out of a urlset. Tolerates a missing lastmod. */
export function parseSitemap(xml: string): SitemapEntry[] {
  const out: SitemapEntry[] = [];
  for (const block of xml.match(/<url>[\s\S]*?<\/url>/gi) ?? []) {
    const loc = block.match(/<loc>\s*([^<]+?)\s*<\/loc>/i)?.[1];
    if (!loc) {
      continue;
    }
    const raw = block.match(/<lastmod>\s*([^<]+?)\s*<\/lastmod>/i)?.[1];
    const d = raw ? new Date(raw) : null;
    out.push({ loc, lastmod: d && !Number.isNaN(d.getTime()) ? d : null });
  }
  return out;
}

/**
 * Candidate URLs: inside the section we trust, and touched recently enough to
 * be worth looking at. `lastmod` is used ONLY as a cheap "might be new" filter
 * here — never as the article's date, which comes from the page's JSON-LD.
 */
export function selectCandidates(
  entries: SitemapEntry[],
  opts: { pathPrefix: string; windowDays: number; now?: number }
): SitemapEntry[] {
  const now = opts.now ?? Date.now();
  const cutoff = now - opts.windowDays * 24 * 60 * 60 * 1000;
  return entries
    .filter((e) => {
      let path: string;
      try {
        path = new URL(e.loc).pathname;
      } catch {
        return false;
      }
      return path.startsWith(opts.pathPrefix);
    })
    .filter((e) => e.lastmod !== null && e.lastmod.getTime() >= cutoff)
    .sort((a, b) => (b.lastmod as Date).getTime() - (a.lastmod as Date).getTime());
}

/** The Article node out of a page's JSON-LD, wherever it sits in the graph. */
interface ArticleLd {
  headline?: string;
  datePublished?: string;
  description?: string;
  image?: string | string[] | { url?: string };
}

function firstImage(image: ArticleLd["image"]): string | undefined {
  if (!image) {
    return undefined;
  }
  if (typeof image === "string") {
    return image;
  }
  if (Array.isArray(image)) {
    return typeof image[0] === "string" ? image[0] : undefined;
  }
  return image.url;
}

/**
 * Find the schema.org Article in a page's ld+json. Pages carry several blocks
 * (Organization, Product, …) and the Article may be nested in an @graph.
 */
export function parseArticleLd(html: string): ArticleLd | null {
  const blocks =
    html.match(
      /<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi
    ) ?? [];
  for (const block of blocks) {
    const json = block.replace(/^[\s\S]*?>/, "").replace(/<\/script>$/i, "");
    let parsed: unknown;
    try {
      parsed = JSON.parse(json);
    } catch {
      continue; // one malformed block shouldn't lose the others
    }
    const graph = (parsed as { "@graph"?: unknown[] })?.["@graph"];
    const nodes = Array.isArray(graph) ? graph : [parsed];
    for (const node of nodes) {
      const type = (node as { "@type"?: unknown })?.["@type"];
      const types = Array.isArray(type) ? type : [type];
      if (types.some((t) => typeof t === "string" && t.includes("Article"))) {
        return node as ArticleLd;
      }
    }
  }
  return null;
}

/**
 * Map a fetched page onto the feed-item shape. Returns null when the page has
 * no Article JSON-LD or no usable date — better to skip an item than to invent
 * a publishedAt and corrupt the feed's ordering.
 */
export function mapArticlePage(
  html: string,
  url: string
): SitemapFeedItem | null {
  const ld = parseArticleLd(html);
  const headline = htmlToText(ld?.headline ?? "").trim();
  const published = ld?.datePublished ? new Date(ld.datePublished) : null;
  if (!headline || !published || Number.isNaN(published.getTime())) {
    return null;
  }
  const img = firstImage(ld?.image);
  return {
    title: headline,
    link: url,
    isoDate: published.toISOString(),
    contentSnippet: htmlToText(ld?.description ?? "").trim(),
    // The page body doubles as the extraction body (BB-239) and as the image
    // ladder's inline-<img> fallback, from the same HTML we already hold.
    "content:encoded": html,
    ...(img ? { enclosure: { url: img } } : {}),
  };
}

/** Fetch the sitemap and return its entries. Throws so the caller logs a failure. */
export async function fetchSitemap(
  url: string,
  timeoutMs = 20000
): Promise<SitemapEntry[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": "BourbonBuddyBot/1.0 (+news ingest)" },
    });
    if (!res.ok) {
      throw new Error(`sitemap ${res.status} for ${url}`);
    }
    return parseSitemap(await res.text());
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Fetch one article page and map it. Best-effort: any failure returns null so a
 * single dead URL never fails the whole source.
 */
export async function fetchArticlePage(
  url: string,
  timeoutMs = 10000
): Promise<SitemapFeedItem | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "BourbonBuddyBot/1.0 (+news ingest)",
        Accept: "text/html,application/xhtml+xml",
      },
    });
    if (!res.ok) {
      return null; // e.g. the sitemap's /reviewcallback/ entries, some of which 404
    }
    return mapArticlePage(await res.text(), res.url || url);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
