/**
 * Pure RSS parsing helpers (BB-050) — no firebase/rss-parser deps, so they're
 * trivially unit-testable. Consumed by news/index.ts's scheduled ingest.
 */
import { createHash } from "crypto";

/** Minimal structural shape of an RSS item we read (avoids an rss-parser dep). */
export interface RawFeedItem {
  enclosure?: { url?: string };
  "media:content"?: { $?: { url?: string } };
  "media:thumbnail"?: { $?: { url?: string } };
  // rss-parser puts <content:encoded> on THIS key, not on `content` — `content`
  // is the <description> teaser (lib/parser.js overwrites it). Mixing the two up
  // silently costs us the hero image on every full-content feed (BB-238).
  "content:encoded"?: string;
  content?: string;
  link?: string;
  isoDate?: string;
  pubDate?: string;
}

/** Stable document id for an article URL (dedupe key on write). */
export function urlHash(url: string): string {
  return createHash("sha1").update(url).digest("hex");
}

/** Lightweight category tagging from the headline + excerpt text. */
export function categorize(text: string): string[] {
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

// ---------------------------------------------------------------------------
// Image discovery (BB-238)
//
// Only Bourbon & Banter emits <media:content>, and nothing emits <enclosure>,
// so the old two-rung lookup found an image for ~1 source in 7. Every other
// working feed carries its hero inside the item HTML instead — <content:encoded>
// for the WordPress feeds, <description> for Squarespace. Parsing those covers
// 5 of 6; the teaser-only feed (Fred Minnick) has no image anywhere in its XML
// and is handled by the og:image fallback in ./og-image.ts.
// ---------------------------------------------------------------------------

/** URL-safe entity decode — feed HTML routinely escapes query-string `&`. */
function decodeUrlEntities(s: string): string {
  return s
    .replace(/&amp;/gi, "&")
    .replace(/&#38;/g, "&")
    .replace(/&#x26;/gi, "&")
    .replace(/&quot;/gi, "\"")
    .replace(/&#39;/g, "'");
}

/**
 * Never a hero image: tracking pixels, spacers, avatars, emoji. Kept
 * deliberately tight — a false reject means no image at all, which is the
 * outcome BB-238 exists to prevent.
 */
const JUNK_IMAGE =
  /(^|[/._-])(1x1|pixel|spacer|blank|transparent|feedburner|feedblitz|gravatar|emoji|avatar)([/._-]|$)|stats\.wordpress\.com|pixel\.wp\.com/i;

/**
 * Accept only real, absolute http(s) image URLs. Resolves protocol-relative and
 * site-relative srcs against the item link. Returns null for anything odd
 * (data: URIs, javascript:, junk) rather than storing a URL that can't render.
 */
export function normalizeImageUrl(
  raw: string | undefined,
  base?: string
): string | null {
  if (!raw) {
    return null;
  }
  let url = decodeUrlEntities(raw.trim());
  if (!url || url.startsWith("data:")) {
    return null;
  }
  if (url.startsWith("//")) {
    url = `https:${url}`;
  }
  try {
    const resolved = new URL(url, base || undefined);
    if (resolved.protocol !== "http:" && resolved.protocol !== "https:") {
      return null;
    }
    return JUNK_IMAGE.test(resolved.href) ? null : resolved.href;
  } catch {
    return null; // relative src with no usable base, or malformed URL
  }
}

/** Read one attribute off a single tag string. */
function attr(tag: string, name: string): string | undefined {
  const m = tag.match(
    new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, "i")
  );
  return m ? (m[1] ?? m[2] ?? m[3]) : undefined;
}

/** True when the tag advertises itself as icon-sized (a tracking pixel tell). */
function isTiny(tag: string): boolean {
  for (const dim of ["width", "height"]) {
    const n = Number.parseInt(attr(tag, dim) ?? "", 10);
    if (Number.isFinite(n) && n > 0 && n <= 64) {
      return true;
    }
  }
  return false;
}

/**
 * First usable <img> in a block of feed HTML. Walks tags in document order —
 * the hero leads the body on every source we ingest — and within a tag tries
 * the lazy-loading attributes too, since some feeds park a placeholder in `src`
 * and the real image in `data-src`.
 */
export function firstImageIn(
  html: string | undefined,
  base?: string
): string | null {
  if (!html) {
    return null;
  }
  for (const tag of html.match(/<img\b[^>]*>/gi) ?? []) {
    if (isTiny(tag)) {
      continue;
    }
    const candidates = [
      attr(tag, "src"),
      attr(tag, "data-src"),
      attr(tag, "data-lazy-src"),
      attr(tag, "data-original"),
      attr(tag, "srcset")?.split(",")[0]?.trim().split(/\s+/)[0],
    ];
    for (const c of candidates) {
      const url = normalizeImageUrl(c, base);
      if (url) {
        return url;
      }
    }
  }
  return null;
}

/**
 * Best available hero image for a feed item, or null when the feed carries
 * none (the caller then falls back to fetching the article's og:image).
 * Ordered most- to least-explicit; `base` resolves relative srcs.
 */
export function thumbnailFrom(
  item: RawFeedItem,
  base?: string
): string | null {
  const link = base ?? item.link;
  return (
    normalizeImageUrl(item.enclosure?.url, link) ??
    normalizeImageUrl(item["media:content"]?.$?.url, link) ??
    normalizeImageUrl(item["media:thumbnail"]?.$?.url, link) ??
    firstImageIn(item["content:encoded"], link) ??
    firstImageIn(item.content, link)
  );
}

/** Parses the item's publish date, or null when missing/invalid. */
export function publishedAt(item: RawFeedItem): Date | null {
  const raw = item.isoDate ?? item.pubDate;
  if (!raw) {
    return null;
  }
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}
