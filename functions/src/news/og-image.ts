/**
 * og:image fallback for feeds that syndicate a teaser only (BB-238).
 *
 * Most sources carry their hero inside the feed item, which ./parse.ts reads
 * for free. Fred Minnick's feed carries no image at all — no enclosure, no
 * media:*, no content:encoded, and a <description> of bare <p> text — so the
 * article page's Open Graph tag is the only route to its hero.
 *
 * Deliberately regex-based rather than a DOM parse: we need four meta tags out
 * of the <head>, and running linkedom over every article page during ingest
 * would cost far more than it's worth. Best-effort throughout — any failure
 * returns null and the card simply renders without an image.
 */
import { normalizeImageUrl } from "./parse";

/** Only the head matters, and it comes first — don't scan a 500KB body. */
const MAX_HTML_SCAN = 200_000;

/** Ordered best-first; og:image is the canonical hero on every CMS we ingest. */
const META_KEYS = [
  "og:image:secure_url",
  "og:image:url",
  "og:image",
  "twitter:image",
  "twitter:image:src",
];

function metaAttr(tag: string, name: string): string | undefined {
  const m = tag.match(
    new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, "i")
  );
  return m ? (m[1] ?? m[2] ?? m[3]) : undefined;
}

/**
 * Pull the Open Graph / Twitter card image out of a page's HTML.
 * `base` resolves relative content values. Pure — unit-tested without network.
 */
export function parseOgImage(
  html: string,
  base?: string
): string | null {
  if (!html) {
    return null;
  }
  const head = html.slice(0, MAX_HTML_SCAN);
  // Collect every candidate first, then pick by META_KEYS precedence — a page
  // may declare twitter:image before og:image and we still want og:image.
  const found = new Map<string, string>();
  for (const tag of head.match(/<meta\b[^>]*>/gi) ?? []) {
    const key = (metaAttr(tag, "property") ?? metaAttr(tag, "name") ?? "")
      .trim()
      .toLowerCase();
    if (!key || found.has(key)) {
      continue; // first declaration of a key wins
    }
    const content = metaAttr(tag, "content");
    if (content) {
      found.set(key, content);
    }
  }
  for (const key of META_KEYS) {
    const url = normalizeImageUrl(found.get(key), base);
    if (url) {
      return url;
    }
  }
  return null;
}

/**
 * Fetch an article page and return its og:image, or null. Never throws and
 * never blocks ingest for long: a short timeout, and a non-OK/non-HTML
 * response is simply "no image".
 */
export async function fetchOgImage(
  url: string,
  timeoutMs = 5000
): Promise<string | null> {
  if (!url) {
    return null;
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      redirect: "follow",
      headers: {
        // Some hosts serve a challenge page to unknown agents; a browser-ish
        // Accept plus our bot UA gets the real HTML from the sources we use.
        "User-Agent": "BourbonBuddyBot/1.0 (+article images)",
        Accept: "text/html,application/xhtml+xml",
      },
    });
    if (!res.ok) {
      return null;
    }
    const type = res.headers.get("content-type") ?? "";
    if (type && !type.includes("html")) {
      return null;
    }
    return parseOgImage(await res.text(), res.url || url);
  } catch {
    return null; // network error, timeout, abort — the card renders text-only
  } finally {
    clearTimeout(timer);
  }
}
