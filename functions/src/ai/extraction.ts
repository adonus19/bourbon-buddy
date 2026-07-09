/**
 * Bottle-extraction response handling (BB-195).
 *
 * The news feed deliberately pulls articles that aren't whiskey-only, and once
 * extraction started reading full article bodies (BB-130) the model began
 * returning tequila, gin, and beer alongside whiskey. Filtering lives HERE, at
 * the extraction layer, so a future decision to embrace other spirits only has
 * to relax this module — the prompt asks the model to label each product's
 * spirit, and `parseExtractionResponse` drops everything that isn't whiskey.
 */

// Category values must match the app's BourbonCategory enum; anything else the
// model returns is dropped to null so it never pollutes the hunt-list form.
export const VALID_CATEGORIES = new Set([
  "bourbon",
  "rye",
  "wheat_whiskey",
  "tennessee",
  "american_other",
  "scotch",
  "irish",
  "japanese",
  "world_other",
]);

export interface ExtractedBottle {
  name: string;
  distillery: string | null;
  category: string | null;
  // Raw flavor cues the article attributes to this bottle (BB-185 feed a);
  // mapped to canonical tags server-side. Absent/empty for non-review articles.
  flavor?: unknown;
}

export const EXTRACTION_SYSTEM_PROMPT =
  "You extract WHISKEY product mentions from a news snippet. The text may " +
  "cover many drinks — include ONLY whiskeys (bourbon, rye, wheat whiskey, " +
  "Tennessee, American single malt, scotch, Irish, Japanese, and other world " +
  "whiskies). EXCLUDE every other drink: tequila, mezcal, gin, vodka, rum, " +
  "brandy, cognac, liqueurs, canned or ready-to-drink cocktails, beer, cider, " +
  "wine, and hard seltzer. Reply ONLY with JSON: {\"bottles\": [{\"name\": " +
  "string, \"spirit\": \"whiskey\"|\"other\", \"distillery\": string|null, " +
  "\"category\": string|null, \"flavor\": {\"nose\": string[], \"palate\": " +
  "string[], \"finish\": string[]}}]}. " +
  "name: the specific product (release/expression/bottling) as written, e.g. " +
  "\"Weller 12 Year\" or \"E.H. Taylor Small Batch\". " +
  "spirit: \"whiskey\" if the product is any style of whiskey, otherwise " +
  "\"other\" (non-whiskey products are discarded, so omitting them is fine " +
  "too). " +
  "distillery: the producing distillery or brand owner if you are confident, " +
  "else null. " +
  "category: exactly one of bourbon, rye, wheat_whiskey, tennessee, " +
  "american_other, scotch, irish, japanese, world_other — or null if unsure. " +
  "flavor: ONLY if the article gives tasting notes for this bottle, the flavor " +
  "words it uses per stage (e.g. vanilla, oak, cherry, smoke). MOST articles " +
  "are announcements with NO tasting notes — for those use empty arrays. Never " +
  "invent flavors. " +
  "Include specific products only; exclude bare distillery/brand names, " +
  "generic terms (bourbon, rye), people, places, and events. Do NOT include " +
  "price or invent details. No duplicates. If none, use an empty array.";

/**
 * Parses the model's JSON reply into whiskey-only `ExtractedBottle`s.
 *
 * Shape problems (missing array, non-object entries, blank names) degrade to
 * fewer bottles, but malformed JSON throws — the caller treats that as an
 * extraction failure so the article stays unmarked and gets retried by the
 * sweep instead of being cached as "extracted, zero bottles".
 */
export function parseExtractionResponse(content: string): ExtractedBottle[] {
  const parsed = JSON.parse(content) as { bottles?: unknown };
  if (!Array.isArray(parsed.bottles)) {
    return [];
  }
  return parsed.bottles
    .filter((b): b is Record<string, unknown> => !!b && typeof b === "object")
    .filter((b) => isWhiskey(b))
    .map((b) => ({
      name: typeof b["name"] === "string" ? (b["name"] as string) : "",
      distillery:
        typeof b["distillery"] === "string" ? (b["distillery"] as string) : null,
      category:
        typeof b["category"] === "string" && VALID_CATEGORIES.has(b["category"] as string)
          ? (b["category"] as string)
          : null,
      flavor: b["flavor"] ?? null,
    }))
    .filter((b) => b.name.trim().length > 0);
}

/**
 * Whether an extracted product is a whiskey. Trusts the model's `spirit`
 * label; when it's absent (older-style reply), a category outside the whiskey
 * enum (the model volunteering "tequila", "beer", …) is a drop signal — only
 * a valid whiskey category or an honest null passes.
 */
function isWhiskey(b: Record<string, unknown>): boolean {
  const spirit = b["spirit"];
  if (typeof spirit === "string") {
    return spirit === "whiskey";
  }
  const category = b["category"];
  return (
    category === null ||
    category === undefined ||
    (typeof category === "string" && VALID_CATEGORIES.has(category))
  );
}
