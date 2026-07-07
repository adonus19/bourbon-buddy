/**
 * Article body extraction for AI bottle discovery (BB-130 fix).
 *
 * The RSS ingest only stores a ~320-char teaser (`excerpt`), so the model used
 * to see almost none of the article and missed bottles named deeper in the body.
 * These helpers give the model the real text:
 *   - `htmlToText`   — strip an HTML body (e.g. RSS `content:encoded`) to plain text.
 *   - `fetchArticleBody` — fetch the article URL and pull the main body via
 *     Readability (fallback for feeds that only syndicate a teaser).
 *   - `buildModelText`  — compose headline + body and cap it for the model call.
 *
 * All best-effort: network/parse failures return '' so extraction never throws.
 */
import { Readability } from "@mozilla/readability";
import { parseHTML } from "linkedom";

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};

/** Decode the handful of HTML entities that survive tag stripping. */
function decodeEntities(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_, d: string) => codePoint(Number(d)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h: string) => codePoint(parseInt(h, 16)))
    .replace(
      /&([a-z]+);/gi,
      (m, e: string) => NAMED_ENTITIES[e.toLowerCase()] ?? m
    );
}

function codePoint(n: number): string {
  return Number.isFinite(n) && n > 0 ? String.fromCodePoint(n) : " ";
}

/** Strip HTML to readable plain text: drop script/style, tags → space, collapse. */
export function htmlToText(html: string): string {
  if (!html) {
    return "";
  }
  return decodeEntities(
    html
      .replace(/<(script|style|noscript)[\s\S]*?<\/\1>/gi, " ")
      .replace(/<[^>]+>/g, " ")
  )
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Fetch the article URL and return its main body text via Readability, falling
 * back to a full-page strip when Readability finds too little. Best-effort:
 * returns '' on any network/parse error or non-OK response.
 */
export async function fetchArticleBody(
  url: string,
  timeoutMs = 8000
): Promise<string> {
  if (!url) {
    return "";
  }
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let html: string;
    try {
      const res = await fetch(url, {
        signal: controller.signal,
        headers: { "User-Agent": "BourbonBuddyBot/1.0 (+bottle discovery)" },
      });
      if (!res.ok) {
        return "";
      }
      html = await res.text();
    } finally {
      clearTimeout(timer);
    }

    const { document } = parseHTML(html);
    // Readability mutates the document; that's fine, it's a throwaway parse.
    const parsed = new Readability(document as never).parse();
    const readText = (parsed?.textContent ?? "").replace(/\s+/g, " ").trim();
    return readText.length >= 200 ? readText : htmlToText(html);
  } catch {
    return ""; // never throw — the caller falls back to the stored excerpt
  }
}

/** Compose the model input from headline + body and cap it. */
export function buildModelText(
  headline: string,
  body: string,
  maxChars: number
): string {
  return `${headline}\n${body}`.trim().slice(0, maxChars);
}
