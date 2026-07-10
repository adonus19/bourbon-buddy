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
  "A product is something a shopper could ask for BY NAME at a store: a brand " +
  "plus (usually) an expression. It must be named in the text as a product. " +
  "NEVER turn a description of whiskey into a product name. From \"sources " +
  "award-winning bourbon and rye barrels from multiple distilleries to create " +
  "small-batch expressions\", the correct answer is an EMPTY array — " +
  "\"award-winning bourbon\", \"award-winning rye\", and \"small-batch " +
  "expressions\" are descriptions, not bottles. " +
  "Also exclude: bare distillery, brand, and company names (\"Pursuit " +
  "Spirits\", \"Buffalo Trace Distillery\"), podcasts, tours, trails, events, " +
  "awards, people, and places. A brand named without a specific expression is " +
  "NOT a product. " +
  "Most articles announce news and name no bottle at all — returning an empty " +
  "array is the common, correct answer. Prefer omitting a doubtful bottle over " +
  "including it. Do NOT include price or invent details. No duplicates.";

/**
 * Whiskey vocabulary, qualifiers, and grammar words. A name built only from
 * these is a description of whiskey, not a whiskey you can buy.
 */
const GENERIC_TOKENS = new Set([
  // the spirit itself
  "whiskey", "whisky", "whiskeys", "whiskies", "bourbon", "bourbons", "rye",
  "ryes", "scotch", "malt", "corn", "wheat", "wheated", "american", "irish",
  "japanese", "tennessee", "kentucky",
  // style / process qualifiers
  "single", "double", "barrel", "barrels", "small", "batch", "cask", "strength",
  "straight", "blend", "blended", "blends", "bottled", "bond", "proof", "aged",
  "age", "year", "years", "yr", "yrs", "old", "finished", "sourced", "craft",
  "high", "low", "unfiltered", "uncut",
  // product/marketing nouns
  "expression", "expressions", "release", "releases", "edition", "editions",
  "bottle", "bottles", "bottling", "bottlings", "collection", "series",
  "label", "brand", "distillery", "distilleries", "spirits",
  // marketing adjectives
  "award", "awarded", "winning", "limited", "special", "new", "latest",
  "premium", "rare", "exclusive", "annual",
  // grammar
  "and", "or", "the", "of", "a", "an", "with", "from", "by", "in", "its",
]);

/**
 * Words that make a name a *company* rather than a product. Bare brand and
 * distillery names are already excluded by the prompt; this catches the ones
 * that slip through ("Pursuit Spirits" is the producer, not a bottle).
 */
const COMPANY_SUFFIXES = new Set([
  "spirits", "distillery", "distilleries", "distilling", "distillers",
  "company", "co", "brands", "group", "holdings", "llc", "inc", "podcast",
]);

/** Splits on whitespace and dashes, then strips surrounding punctuation. */
function tokenize(name: string): string[] {
  return name
    .split(/[\s\-–—/]+/)
    .map((t) => t.replace(/[^\p{L}\p{N}.']/gu, ""))
    .filter((t) => t.length > 0);
}

/**
 * A token that could plausibly be part of a brand: not whiskey vocabulary, and
 * capitalized the way a proper noun is. Bare numbers only count at four digits
 * ("1792", "1920" are brands; the "12" in "Weller 12 Year" is an age).
 */
function isDistinctive(token: string): boolean {
  const bare = token.toLowerCase().replace(/[.']/g, "");
  if (!bare || GENERIC_TOKENS.has(bare)) {
    return false;
  }
  if (/^\d+$/.test(bare)) {
    return bare.length === 4;
  }
  return /^[A-Z0-9]/.test(token);
}

/**
 * Whether an extracted name is a real, buyable product (BB-201).
 *
 * The model reliably turns descriptive prose into "bottles": an article saying a
 * brand "sources award-winning bourbon and rye barrels ... to create small-batch
 * expressions" yielded `award-winning bourbon`, `award-winning rye`, and
 * `small-batch expressions` — each of which then got a catalog entry and, from
 * the enrichment sweep, an invented flavor profile. A prompt alone can't be
 * trusted to hold this line, so the check is deterministic and testable: a
 * product needs at least one proper-noun token that isn't whiskey vocabulary,
 * and must not end in a company suffix.
 */
export function isProductName(name: string): boolean {
  const tokens = tokenize(name);
  if (tokens.length === 0) {
    return false;
  }
  const last = tokens[tokens.length - 1].toLowerCase().replace(/\./g, "");
  if (COMPANY_SUFFIXES.has(last)) {
    return false;
  }
  return tokens.some(isDistinctive);
}

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
    .filter((b) => b.name.trim().length > 0)
    .filter((b) => isProductName(b.name));
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
