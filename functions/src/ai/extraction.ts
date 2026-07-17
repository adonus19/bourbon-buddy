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

// Release cadence values the model may return (BB-219); anything else → null.
export const VALID_RELEASE_TYPES = new Set([
  "flagship",
  "annual",
  "limited",
  "single_barrel",
]);

// Source classification (BB-220). Trust flows from it: flavor seeds and
// verdicts from press releases are marketing, not evaluation, and are dropped.
export const VALID_ARTICLE_TYPES = new Set([
  "press_release",
  "independent_review",
  "listicle",
  "news",
]);

// Article types whose tasting language reflects an actual critical evaluation.
export const EVALUATIVE_TYPES = new Set(["independent_review", "listicle"]);

// Per-bottle opinion values (BB-220); anything else → null.
export const VALID_VERDICTS = new Set(["rave", "positive", "mixed", "negative"]);

// Sanity ranges for article-stated facts (BB-219). Values outside these are
// dropped even when verbatim in the text — they're some *other* number the
// model misattributed (barrel counts, anniversaries, raffle tickets).
const PROOF_MIN = 60;
const PROOF_MAX = 160;
const AGE_MIN = 1;
const AGE_MAX = 50;
const MSRP_MIN = 10;
const MSRP_MAX = 10000;

export interface ExtractedBottle {
  name: string;
  distillery: string | null;
  category: string | null;
  // Raw flavor cues the article attributes to this bottle (BB-185 feed a);
  // mapped to canonical tags server-side. Absent/empty for non-review articles.
  flavor?: unknown;
  // Article-stated facts (BB-219), each verified verbatim-in-text and
  // range-clamped before it's trusted; null-only backfilled onto the catalog.
  proof: number | null;
  ageYears: number | null;
  msrp: number | null;
  releaseType: string | null;
  // The writer's opinion of this bottle (BB-220); kept only from evaluative
  // article types (independent_review / listicle) — never from marketing copy.
  verdict: string | null;
}

export const EXTRACTION_SYSTEM_PROMPT =
  "You extract WHISKEY product mentions from a news snippet. The text may " +
  "cover many drinks — include ONLY whiskeys (bourbon, rye, wheat whiskey, " +
  "Tennessee, American single malt, scotch, Irish, Japanese, and other world " +
  "whiskies). EXCLUDE every other drink: tequila, mezcal, gin, vodka, rum, " +
  "brandy, cognac, liqueurs, canned or ready-to-drink cocktails, beer, cider, " +
  "wine, and hard seltzer. Reply ONLY with JSON: {\"articleType\": " +
  "\"press_release\"|\"independent_review\"|\"listicle\"|\"news\", " +
  "\"bottles\": [{\"name\": " +
  "string, \"spirit\": \"whiskey\"|\"other\", \"distillery\": string|null, " +
  "\"category\": string|null, \"flavor\": {\"nose\": string[], \"palate\": " +
  "string[], \"finish\": string[]}}]}. " +
  "articleType — classify the TEXT itself: press_release (announcement written " +
  "from or echoing the producer's marketing — promotional tone, company " +
  "quotes, no critical evaluation), independent_review (a writer's own " +
  "critical tasting or evaluation), listicle (ranked roundup like \"best " +
  "bourbons\"), news (anything else: industry, business, people, events). " +
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
  "Each bottle also carries \"proof\": number|null, \"ageYears\": number|null, " +
  "\"msrp\": number|null, \"releaseType\": \"flagship\"|\"annual\"|\"limited\"|" +
  "\"single_barrel\"|null. " +
  "proof/ageYears/msrp: ONLY when the text explicitly states them for THIS " +
  "bottle — copy the number exactly as printed, never estimate, convert, or " +
  "carry over from another bottle. msrp is the suggested/retail price in USD " +
  "stated in the text. " +
  "releaseType: flagship (core year-round product), annual (recurring yearly " +
  "release), limited (one-time or allocated release), single_barrel — or null " +
  "when the text doesn't say. " +
  "Each bottle also carries \"verdict\": \"rave\"|\"positive\"|\"mixed\"|" +
  "\"negative\"|null — the AUTHOR'S OWN opinion of this bottle from their " +
  "evaluation (rave = exceptional, glowing). Marketing claims, producer " +
  "quotes, and neutral announcements are NOT opinions: verdict is null there. " +
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
  "including it. Never invent details; every number must be copied from the " +
  "text. No duplicates.";

/**
 * Gemini responseSchema for the extraction reply (BB-226): constrained
 * decoding on gemini-3.1-flash-lite guarantees parseable JSON in the right
 * shape. It does NOT replace the parse-side guards below — enums here stop
 * malformed JSON, not misjudged content (verbatim-fact checks, isProductName,
 * and verdict gating still decide what's true).
 */
export const EXTRACTION_RESPONSE_SCHEMA: Record<string, unknown> = {
  type: "OBJECT",
  properties: {
    articleType: {
      type: "STRING",
      enum: [...VALID_ARTICLE_TYPES],
    },
    bottles: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          name: { type: "STRING" },
          spirit: { type: "STRING", enum: ["whiskey", "other"] },
          distillery: { type: "STRING", nullable: true },
          category: { type: "STRING", enum: [...VALID_CATEGORIES], nullable: true },
          proof: { type: "NUMBER", nullable: true },
          ageYears: { type: "NUMBER", nullable: true },
          msrp: { type: "NUMBER", nullable: true },
          releaseType: {
            type: "STRING",
            enum: [...VALID_RELEASE_TYPES],
            nullable: true,
          },
          verdict: { type: "STRING", enum: [...VALID_VERDICTS], nullable: true },
          flavor: {
            type: "OBJECT",
            properties: {
              nose: { type: "ARRAY", items: { type: "STRING" } },
              palate: { type: "ARRAY", items: { type: "STRING" } },
              finish: { type: "ARRAY", items: { type: "STRING" } },
            },
          },
        },
        required: ["name", "spirit"],
      },
    },
  },
  required: ["articleType", "bottles"],
};

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
 * Whether a number appears verbatim in the text (BB-219): digit-bounded, exact
 * decimal (93 never matches "93.7" and vice versa), tolerant of a thousands
 * comma ($1,299 ↔ 1299). With `requireDollar`, a `$` must immediately precede
 * it — the msrp guard, so "110 barrels" can't validate a $110 price.
 *
 * This is the anti-hallucination line for facts: the model may only COPY
 * numbers, because anything not literally printed in the article is dropped.
 * (Necessary, not sufficient — the range clamps catch misattributed numbers.)
 */
export function numberAppearsInText(
  value: number,
  text: string,
  requireDollar = false
): boolean {
  if (!Number.isFinite(value) || !text) {
    return false;
  }
  const [int, frac] = String(value).split(".");
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, ",?");
  // Not followed by another digit, or by a decimal fraction ("93" ≠ "93.7") —
  // but a sentence-ending period is fine.
  const core = grouped + (frac ? `\\.${frac}` : "") + "(?!\\d)(?!\\.\\d)";
  const re = requireDollar
    ? new RegExp(`\\$\\s?${core}`)
    : new RegExp(`(?<![\\d.,])${core}`);
  return re.test(text);
}

/** A model-reported fact, kept only when in range and verbatim in the text. */
function verifiedFact(
  raw: unknown,
  text: string,
  min: number,
  max: number,
  requireDollar = false
): number | null {
  if (typeof raw !== "number" || !Number.isFinite(raw)) {
    return null;
  }
  if (raw < min || raw > max) {
    return null;
  }
  return numberAppearsInText(raw, text, requireDollar) ? raw : null;
}

/**
 * The model's source classification for the article (BB-220), defaulting to
 * "news" when missing or off-enum — the least-trusted bucket, so a flaky
 * classification can only ever *withhold* signal, never fake it. Malformed
 * JSON throws, same retry semantics as `parseExtractionResponse`.
 */
export function parseArticleType(content: string): string {
  const parsed = JSON.parse(content) as { articleType?: unknown };
  return typeof parsed.articleType === "string" &&
    VALID_ARTICLE_TYPES.has(parsed.articleType)
    ? parsed.articleType
    : "news";
}

/**
 * Parses the model's JSON reply into whiskey-only `ExtractedBottle`s.
 *
 * `sourceText` is the article text the model read; fact fields (BB-219) are
 * kept only when their numbers appear verbatim in it, so omitting it simply
 * nulls every fact. Verdicts (BB-220) are kept only when the reply's own
 * articleType is evaluative (independent_review / listicle) — a "verdict"
 * lifted from marketing copy is dropped here, not left to the prompt.
 *
 * Shape problems (missing array, non-object entries, blank names) degrade to
 * fewer bottles, but malformed JSON throws — the caller treats that as an
 * extraction failure so the article stays unmarked and gets retried by the
 * sweep instead of being cached as "extracted, zero bottles".
 */
export function parseExtractionResponse(
  content: string,
  sourceText = ""
): ExtractedBottle[] {
  const parsed = JSON.parse(content) as { bottles?: unknown };
  if (!Array.isArray(parsed.bottles)) {
    return [];
  }
  const evaluative = EVALUATIVE_TYPES.has(parseArticleType(content));
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
      proof: verifiedFact(b["proof"], sourceText, PROOF_MIN, PROOF_MAX),
      ageYears: verifiedFact(b["ageYears"], sourceText, AGE_MIN, AGE_MAX),
      msrp: verifiedFact(b["msrp"], sourceText, MSRP_MIN, MSRP_MAX, true),
      releaseType:
        typeof b["releaseType"] === "string" &&
        VALID_RELEASE_TYPES.has(b["releaseType"] as string)
          ? (b["releaseType"] as string)
          : null,
      verdict:
        evaluative &&
        typeof b["verdict"] === "string" &&
        VALID_VERDICTS.has(b["verdict"] as string)
          ? (b["verdict"] as string)
          : null,
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
