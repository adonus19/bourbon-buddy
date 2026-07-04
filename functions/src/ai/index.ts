/**
 * AI "Find Bottles" (BB-130).
 *
 * When a news article is written, extract the whiskey/bourbon product names it
 * mentions (via an LLM), match them to the shared catalog (creating the entry
 * from the AI-sourced fields when it's new), and cache the result ON THE ARTICLE. This runs ONCE per article, ever — never per user, per view,
 * or per refresh — so the cost is flat and tiny no matter how many people read
 * it. The client reads the cached `mentionedBottles` field; no per-user AI cost.
 *
 * Provider: Groq (free tier, OpenAI-compatible). Chosen over Gemini free tier
 * for its far higher daily request cap (~14.4k RPD on llama-3.1-8b-instant vs
 * ~200) and no region/billing-project free-tier traps. The key is a Secret
 * Manager secret (GROQ_API_KEY), never in code. All model-specific code lives in
 * `extractBottleNames`, so swapping providers again is a one-function change.
 */
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { logger } from "firebase-functions/v2";
import { defineSecret } from "firebase-functions/params";
import { onDocumentCreated } from "firebase-functions/v2/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { onSchedule } from "firebase-functions/v2/scheduler";

import { normalizeBottleName } from "../shared/normalize";

const GROQ_API_KEY = defineSecret("GROQ_API_KEY");

// Free-tier: 30 RPM, 14.4k RPD, fast. Swap here if limits/models change.
const GROQ_MODEL = "llama-3.1-8b-instant";
const MAX_BOTTLES = 8;
const MAX_TEXT_CHARS = 1500;
const BACKFILL_DEFAULT = 15;
const BACKFILL_MAX = 50;
const BACKFILL_SPACING_MS = 1200; // gentle pacing to respect free-tier RPM
const SWEEP_LIMIT = 100; // recent articles scanned per scheduled sweep
const RATE_LIMITED = -2; // processArticle sentinel: hit the model rate limit

// Category values must match the app's BourbonCategory enum; anything else the
// model returns is dropped to null so it never pollutes the hunt-list form.
const VALID_CATEGORIES = new Set([
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

interface MentionedBottle {
  name: string;
  bourbonId: string | null;
  distillery: string | null;
  category: string | null;
}

interface ExtractedBottle {
  name: string;
  distillery: string | null;
  category: string | null;
}

/** Thrown when the model returns 429 so callers can back off / stop early. */
class RateLimitError extends Error {
  constructor() {
    super("model_rate_limited");
  }
}

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/** Runs once per new article: extract → match → cache on the article doc. */
export const extractBottlesFromArticle = onDocumentCreated(
  {
    document: "newsArticles/{articleId}",
    region: "us-central1",
    secrets: [GROQ_API_KEY],
    // Cap concurrency so a bulk RSS fetch (dozens of new docs at once) doesn't
    // fire dozens of simultaneous model calls and blow the free-tier RPM.
    maxInstances: 2,
  },
  async (event) => {
    if (!event.data) {
      return;
    }
    const n = await processArticle(
      getFirestore(),
      event.data.ref,
      event.data.data(),
      GROQ_API_KEY.value()
    );
    if (n >= 0) {
      logger.info(`Extracted ${n} bottle(s) for ${event.params.articleId}.`);
    } else if (n === RATE_LIMITED) {
      // Left unprocessed on purpose — a later fetch/backfill will pick it up.
      logger.warn(`Rate limited on ${event.params.articleId}; will retry later.`);
    }
  }
);

/**
 * Bounded backfill / test tool: extract bottles for the most recent articles
 * that haven't been processed yet. Signed-in only and capped at 50 per call so
 * it can't run away. (Lock down or remove before a public launch.)
 */
export const backfillArticleBottles = onCall(
  { region: "us-central1", secrets: [GROQ_API_KEY], timeoutSeconds: 300 },
  async (request) => {
    if (!request.auth?.uid) {
      throw new HttpsError("unauthenticated", "Sign in to run the backfill.");
    }
    const requested = Number((request.data as { limit?: number })?.limit);
    const limit = Math.min(
      Math.max(Number.isFinite(requested) ? requested : BACKFILL_DEFAULT, 1),
      BACKFILL_MAX
    );
    const res = await sweepUnprocessed(getFirestore(), GROQ_API_KEY.value(), limit);
    logger.info(
      `Backfill: scanned ${res.scanned}, processed ${res.processed}` +
        (res.rateLimited ? " (stopped: rate limited)." : ".")
    );
    return res;
  }
);

/**
 * Scheduled safety net (BB-130): the onCreate trigger only fires for brand-new
 * article URLs, so pre-existing articles and re-fetched ones (updates) never get
 * extracted. This sweep periodically extracts any recent article still missing
 * bottlesExtractedAt, rate-paced and self-healing (stops on 429, resumes next run).
 */
export const sweepArticleBottles = onSchedule(
  {
    schedule: "every 2 hours",
    region: "us-central1",
    secrets: [GROQ_API_KEY],
    timeoutSeconds: 300,
  },
  async () => {
    const res = await sweepUnprocessed(
      getFirestore(),
      GROQ_API_KEY.value(),
      SWEEP_LIMIT
    );
    logger.info(
      `Sweep: scanned ${res.scanned}, processed ${res.processed}` +
        (res.rateLimited ? " (stopped: rate limited)." : ".")
    );
  }
);

/**
 * Scans the most-recently-fetched articles and extracts bottles for any that
 * lack `bottlesExtractedAt`, pacing calls and stopping early on a rate limit.
 */
async function sweepUnprocessed(
  db: FirebaseFirestore.Firestore,
  apiKey: string,
  limit: number
): Promise<{
  scanned: number;
  processed: number;
  skipped: number;
  rateLimited: boolean;
}> {
  const snap = await db
    .collection("newsArticles")
    .orderBy("fetchedAt", "desc")
    .limit(limit)
    .get();

  let processed = 0;
  let skipped = 0;
  let rateLimited = false;
  for (const doc of snap.docs) {
    const data = doc.data();
    if (data.bottlesExtractedAt) {
      skipped++;
      continue; // already extracted
    }
    const n = await processArticle(db, doc.ref, data, apiKey);
    if (n === RATE_LIMITED) {
      rateLimited = true;
      break; // stop hammering a limited quota; unprocessed docs stay for later
    }
    if (n >= 0) {
      processed++;
    } else {
      skipped++;
    }
    await sleep(BACKFILL_SPACING_MS);
  }
  return { scanned: snap.size, processed, skipped, rateLimited };
}

/**
 * Extracts, catalog-matches, and caches bottles for one article. Returns the
 * number written (>= 0), RATE_LIMITED when throttled (left for a later retry),
 * or -1 on other failure (best-effort: never throws — no retry storms / cost).
 */
async function processArticle(
  db: FirebaseFirestore.Firestore,
  ref: FirebaseFirestore.DocumentReference,
  article: FirebaseFirestore.DocumentData | undefined,
  apiKey: string
): Promise<number> {
  if (!article) {
    return -1;
  }
  const headline = (article.headline as string) ?? "";
  const excerpt = (article.excerpt as string) ?? "";
  const text = `${headline}\n${excerpt}`.trim().slice(0, MAX_TEXT_CHARS);
  if (text.length < 12) {
    return 0;
  }

  let extracted: ExtractedBottle[];
  try {
    extracted = await extractBottleNames(text, apiKey);
  } catch (err) {
    if (err instanceof RateLimitError) {
      return RATE_LIMITED; // caller decides whether to stop / retry later
    }
    logger.warn(`Bottle extraction failed for ${ref.id}`, err);
    return -1;
  }

  const seen = new Set<string>();
  const bottles: MentionedBottle[] = [];
  for (const raw of extracted) {
    const name = raw.name.trim();
    const key = normalizeBottleName(name);
    if (!key || seen.has(key)) {
      continue;
    }
    seen.add(key);
    const category =
      raw.category && VALID_CATEGORIES.has(raw.category) ? raw.category : null;
    const distillery = raw.distillery?.trim() || null;
    bottles.push({
      name,
      bourbonId: await matchOrCreateCatalog(db, key, name, distillery, category),
      distillery,
      category,
    });
    if (bottles.length >= MAX_BOTTLES) {
      break;
    }
  }

  await ref.update({
    mentionedBottles: bottles,
    bottlesExtractedAt: FieldValue.serverTimestamp(),
  });
  return bottles.length;
}

/** Finds an existing catalog bottleId for a normalized name, or null. */
async function matchOrCreateCatalog(
  db: FirebaseFirestore.Firestore,
  key: string,
  name: string,
  distillery: string | null,
  category: string | null
): Promise<string> {
  // Match an existing catalog entry (same order the client findOrCreate uses).
  const byName = await db
    .collection("bourbons")
    .where("nameNormalized", "==", key)
    .limit(1)
    .get();
  if (!byName.empty) {
    return byName.docs[0].id;
  }
  const byAlias = await db
    .collection("bourbons")
    .where("aliases", "array-contains", key)
    .limit(1)
    .get();
  if (!byAlias.empty) {
    return byAlias.docs[0].id;
  }
  const nameLowercase = name.toLowerCase();
  const byLower = await db
    .collection("bourbons")
    .where("nameLowercase", "==", nameLowercase)
    .limit(1)
    .get();
  if (!byLower.empty) {
    return byLower.docs[0].id;
  }

  // No match — create the shared catalog entry from the AI-sourced fields so the
  // bottle has a bourbonId usable in autocomplete and cellar/hunt-list entries.
  const created = db.collection("bourbons").doc();
  await created.set({
    name,
    nameLowercase,
    nameNormalized: key,
    aliases: [],
    canonicalId: null,
    distillery: distillery ?? null,
    bottler: null,
    category: category ?? null,
    subType: null,
    ageStatement: null,
    isNas: false,
    proof: null,
    msrp: null,
    series: null,
    createdAt: FieldValue.serverTimestamp(),
    createdByUserId: "system:ai",
  });
  return created.id;
}

/**
 * The ONLY model-specific code. Calls Groq (OpenAI-compatible) and returns the
 * bottles it found, each with an optional distillery + category to pre-fill the
 * hunt-list form. JSON object output for robust parsing, temp 0, hard output
 * cap. Deliberately does NOT ask for price/MSRP (news snippets rarely carry a
 * reliable price, and a hallucinated one is worse than a blank field). Throws
 * RateLimitError on 429.
 */
async function extractBottleNames(
  text: string,
  apiKey: string
): Promise<ExtractedBottle[]> {
  const system =
    "You extract whiskey/bourbon PRODUCT mentions from a news snippet. Reply " +
    "ONLY with JSON: {\"bottles\": [{\"name\": string, \"distillery\": " +
    "string|null, \"category\": string|null}]}. " +
    "name: the specific product (release/expression/bottling) as written, e.g. " +
    "\"Weller 12 Year\" or \"E.H. Taylor Small Batch\". " +
    "distillery: the producing distillery or brand owner if you are confident, " +
    "else null. " +
    "category: exactly one of bourbon, rye, wheat_whiskey, tennessee, " +
    "american_other, scotch, irish, japanese, world_other — or null if unsure. " +
    "Include specific products only; exclude bare distillery/brand names, " +
    "generic terms (bourbon, rye), people, places, and events. Do NOT include " +
    "price or invent details. No duplicates. If none, use an empty array.";

  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: GROQ_MODEL,
      temperature: 0,
      max_tokens: 768,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content: `TEXT:\n${text}` },
      ],
    }),
  });

  if (res.status === 429) {
    throw new RateLimitError();
  }
  if (!res.ok) {
    throw new Error(`Groq ${res.status}: ${await res.text()}`);
  }
  const body = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const content = body.choices?.[0]?.message?.content ?? "{}";
  const parsed = JSON.parse(content) as { bottles?: unknown };
  if (!Array.isArray(parsed.bottles)) {
    return [];
  }
  return parsed.bottles
    .filter((b): b is Record<string, unknown> => !!b && typeof b === "object")
    .map((b) => ({
      name: typeof b["name"] === "string" ? (b["name"] as string) : "",
      distillery:
        typeof b["distillery"] === "string" ? (b["distillery"] as string) : null,
      category:
        typeof b["category"] === "string" ? (b["category"] as string) : null,
    }))
    .filter((b) => b.name.trim().length > 0);
}
