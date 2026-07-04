/**
 * Pure RSS parsing helpers (BB-050) — no firebase/rss-parser deps, so they're
 * trivially unit-testable. Consumed by news/index.ts's scheduled ingest.
 */
import { createHash } from "crypto";

/** Minimal structural shape of an RSS item we read (avoids an rss-parser dep). */
export interface RawFeedItem {
  enclosure?: { url?: string };
  "media:content"?: { $?: { url?: string } };
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

/** First available thumbnail URL from enclosure or media:content, else null. */
export function thumbnailFrom(item: RawFeedItem): string | null {
  return item.enclosure?.url ?? item["media:content"]?.$?.url ?? null;
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
